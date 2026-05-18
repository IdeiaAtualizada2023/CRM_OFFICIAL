import { listarUsuarios, getCurrentUser, login, loginComGoogle, cadastrarUsuario, buscarUsuarioPorId, atualizarUsuario, excluirUsuario, setCurrentUser, initAuth } from './services/authService.js';
import { carregarVendas, salvarVenda, getVenda, excluirVenda, toggleStatusVenda, atualizarEstatisticas } from './services/dataService.js';
import { createPaymentEvent, initGoogleApi } from './services/googleCalendarService.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Sistema CRM Amels - Inicializando...");

    // Inicialização Crítica: Listeners Globais primeiro para garantir funcionalidade da UI
    try {
        setupGlobalEventListeners();
    } catch (e) { console.error("Erro nos listeners:", e); }

    // Inicializa API do Google em segundo plano
    initGoogleApi().catch(e => console.error("Erro ao inicializar Google API:", e));

    try {
        setupLocationAPI();
    } catch (e) { console.error("Erro na API de Localização:", e); }

    // 1. Verificação de Autenticação
    const isUserLogged = localStorage.getItem('crm_current_user');
    if (!isUserLogged) {
        if (typeof exibirTelaLogin === 'function') {
            exibirTelaLogin();
            setupLoginHandler();
        }
        document.body.classList.remove('loading-state');
        return;
    }

    // Se chegou aqui, está logado. Mostra o dashboard.
    document.getElementById('view-dashboard').classList.add('active');

    try {
        const user = getCurrentUser();
        if (user) {
            const elName = document.getElementById('current-user-name');
            const elRole = document.getElementById('current-user-role');
            if (elName) elName.textContent = user.name;
            if (elRole) elRole.textContent = user.role;
            
            const headerAvatar = document.getElementById('user-profile-trigger');
            if (headerAvatar && user.foto) {
                headerAvatar.innerHTML = `<img src="${user.foto}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
        }
    } catch (e) { console.error("Erro ao carregar dados do usuário:", e); }

    // 2. Inicialização de Componentes
    try {
        setupSidebarVisibility();
        updateSellerSelect();
        renderUsersTable();
        setupAdminFilters();
        renderUserSwitcher();
    } catch (e) { console.error("Erro ao carregar componentes:", e); }

    // 4. Carregar Dados Iniciais
    try {
        await atualizarEstatisticas();
    } catch (e) { console.error("Erro ao carregar estatísticas:", e); }

    // Finalização: Revelar o sistema
    document.body.classList.remove('loading-state');
});

function resetNewSaleForm() {
    const form = document.getElementById('new-sale-form');
    if (form) form.reset();
    document.getElementById('venda-id').value = '';
    document.getElementById('form-title').innerText = 'Registrar Nova Venda';
    
    // Limpar dependentes
    const container = document.getElementById('dependentes-container');
    if (container) container.innerHTML = '';
    
    // Restaurar papéis padrões
    const titularRadio = document.querySelector('input[name="papelCliente"][value="Titular"]');
    if (titularRadio) titularRadio.checked = true;

    const indivRadio = document.querySelector('input[name="tipoContrato"][value="Individual"]');
    if (indivRadio) indivRadio.checked = true;

    // Pré-selecionar vendedor se houver filtro ativo
    const sellerSelect = document.getElementById('vendedor-select');
    if (sellerSelect && window.activeSellerFilter) {
        sellerSelect.value = window.activeSellerFilter;
    }
}

function setupGlobalEventListeners() {
    // Navegação Sidebar
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            const currentUser = getCurrentUser();

            if (target === 'users' && currentUser.role !== 'Administrador') {
                alert("Acesso restrito para administradores.");
                return;
            }

            if (target === 'new-sale') {
                // Só reseta se NÃO estivermos em modo de edição (se o form-title for o padrão)
                const title = document.getElementById('form-title').innerText;
                if (title === 'Registrar Nova Venda') {
                    resetNewSaleForm();
                }
            }

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            views.forEach(view => view.classList.remove('active'));
            
            const targetView = document.getElementById(`view-${target}`);
            if(targetView) targetView.classList.add('active');
        });
    });

    // Botão + Nova Venda (Na lista de vendas)
    const btnAddSale = document.getElementById('btn-add-sale');
    if (btnAddSale) {
        btnAddSale.addEventListener('click', () => {
            resetNewSaleForm();
            document.querySelector('.nav-item[data-target="new-sale"]').click();
        });
    }

    // Modal Usuários
    const btnOpenUserModal = document.getElementById('btn-open-user-modal');
    const modalUser = document.getElementById('modal-user');
    const newUserForm = document.getElementById('new-user-form');

    if (btnOpenUserModal && modalUser) {
        btnOpenUserModal.addEventListener('click', () => {
            console.log("Abrindo modal de usuário...");
            document.getElementById('edit-user-id').value = '';
            if (newUserForm) newUserForm.reset();
            
            // Reset visibility
            const passInput = document.getElementById('user-password');
            const toggleBtn = document.getElementById('toggle-password');
            if (passInput) passInput.type = 'password';
            if (toggleBtn) toggleBtn.querySelector('span').textContent = 'visibility';

            document.getElementById('photo-preview').innerHTML = '<span class="material-symbols-outlined" style="font-size: 40px; color: #94a3b8;">person</span>';
            window.tempUserPhoto = null;
            modalUser.classList.add('active');
        });
    }

    // Fechar Modal Usuário
    const btnCloseUser = document.getElementById('btn-close-user-modal');
    const btnCancelUser = document.getElementById('btn-cancel-user-modal');
    [btnCloseUser, btnCancelUser].forEach(btn => {
        if (btn) btn.addEventListener('click', () => modalUser.classList.remove('active'));
    });

    // Cadastro de Usuário (Submit)
    if (newUserForm) {
        newUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(newUserForm);
            const userData = Object.fromEntries(formData.entries());
            const userId = document.getElementById('edit-user-id').value;

            if (window.tempUserPhoto) userData.foto = window.tempUserPhoto;

            try {
                if (userId) {
                    await atualizarUsuario(userId, userData);
                    alert('Usuário atualizado!');
                } else {
                    await cadastrarUsuario(userData);
                    alert('Usuário cadastrado!');
                }
                modalUser.classList.remove('active');
                await renderUsersTable();
                updateSellerSelect();
                renderUserSwitcher();
            } catch (err) {
                alert("Erro ao salvar: " + err.message);
            }
        });
    }
    // Cadastro de Venda (Submit)
    const saleForm = document.getElementById('new-sale-form');
    if (saleForm) {
        saleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("Salvando venda...");
            
            const formData = new FormData(saleForm);
            const vendaData = Object.fromEntries(formData.entries());
            const currentUser = getCurrentUser();

            // Garantia de vendedor
            if (currentUser.role === 'Vendedor') {
                vendaData.vendedor = currentUser.name;
            } else if (!vendaData.vendedor) {
                // Se for admin e não escolheu, assume ele mesmo ou erro
                vendaData.vendedor = currentUser.name;
            }

            // Processar dependentes (Coletando direto das linhas para pegar os radios corretamente)
            const dependentes = [];
            const depRows = document.querySelectorAll('.dependent-row');
            
            depRows.forEach(row => {
                const nome = row.querySelector('[name="dependenteNome[]"]').value;
                const nasc = row.querySelector('[name="dependenteNascimento[]"]').value;
                const cpf = row.querySelector('[name="dependenteCpf[]"]').value;
                const papel = row.querySelector('input[type="radio"]:checked')?.value || 'Titular';
                
                if (nome) {
                    dependentes.push({
                        nome,
                        dataNascimento: nasc,
                        cpf,
                        papel
                    });
                }
            });
            vendaData.dependentes = dependentes;

            // Feedback de loading
            const btnSalvar = saleForm.querySelector('button[type="submit"]');
            const originalBtnText = btnSalvar.innerHTML;
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<span class="material-symbols-outlined spinning">sync</span> Salvando...';

            try {
                // Limpar campos de valor (remover R$ e converter vírgula para ponto se necessário)
                const camposValor = ['valorPlano', 'pagamento1', 'pagamento2', 'pagamento3', 'valorEntrada'];
                camposValor.forEach(campo => {
                    if (vendaData[campo]) {
                        vendaData[campo] = vendaData[campo].replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
                    }
                });

                await salvarVenda(vendaData);
                
                // --- Integração com Google Calendar (Não bloqueia o salvamento) ---
                if (vendaData.syncGoogleCalendar === 'on') {
                    console.log("Iniciando sincronização em segundo plano...");
                    syncVendaComGoogleCalendar(vendaData).catch(err => {
                        console.error("Falha na sincronização automática:", err);
                        alert("Venda salva, mas houve um erro ao sincronizar com Google Agenda. Você pode tentar manualmente nos detalhes da venda.");
                    });
                }
                // ---------------------------------------

                // Limpar filtro para que a venda apareça na lista
                window.activeSellerFilter = null;
                const fSel = document.getElementById('filter-vendedor');
                if (fSel) fSel.value = '';

                alert("Venda salva com sucesso!");
                saleForm.reset();
                document.getElementById('venda-id').value = '';
                document.getElementById('dependentes-container').innerHTML = ''; // Limpa dependentes dinâmicos
                
                await atualizarEstatisticas();
                document.querySelector('.nav-item[data-target="sales"]').click();
            } catch (error) {
                console.error("Erro ao salvar:", error);
                alert("Erro ao salvar venda: " + (error.message || "Erro desconhecido"));
            }
        });
    }

    // Adicionar Dependente
    const btnAddDep = document.getElementById('btn-add-dependente');
    if (btnAddDep) {
        btnAddDep.addEventListener('click', () => {
            addDependenteRow();
        });
    }

    // Modal Visualizar Venda (Fechar)
    const btnCloseView = document.getElementById('btn-close-visualizar');
    if (btnCloseView) {
        btnCloseView.addEventListener('click', () => {
            document.getElementById('modal-visualizar').classList.remove('active');
        });
    }

    // Event Delegation para Ações da Tabela de Vendas
    const allSalesTable = document.getElementById('all-sales-table');
    if (allSalesTable) {
        allSalesTable.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.vendaid;

            if (btn.classList.contains('action-edit')) {
                const venda = await getVenda(id);
                if (venda) {
                    preencherFormVenda(venda);
                    document.querySelector('.nav-item[data-target="new-sale"]').click();
                }
            } else if (btn.classList.contains('action-delete')) {
                if (!id) {
                    alert("Erro: ID da venda não encontrado!");
                    return;
                }
                if (confirm('Deseja excluir permanentemente a venda ID: ' + id + '?')) {
                    console.log("Iniciando exclusão para ID:", id);
                    const sucesso = await excluirVenda(id);
                    if (sucesso) {
                        alert("Venda excluída!");
                        await atualizarEstatisticas();
                    } else {
                        alert("Erro ao excluir no Firebase. Verifique o console.");
                    }
                }
            } else if (btn.classList.contains('action-status')) {
                btn.style.opacity = '0.5';
                btn.disabled = true;
                const sucesso = await toggleStatusVenda(id);
                if (sucesso) {
                    // Removi o alert de sucesso para ficar mais profissional, 
                    // mas mantive o recarregamento dos dados.
                    await atualizarEstatisticas();
                } else {
                    // O alerta de erro agora vem de dentro do dataService.js se for permissão
                }
                btn.style.opacity = '1';
                btn.disabled = false;
            } else if (btn.classList.contains('action-view')) {
                const venda = await getVenda(id);
                if (venda) exibirDetalhesVenda(venda);
            }
        });
    }

    // Troca de Usuário (Trigger)
    const userTrigger = document.getElementById('user-profile-trigger');
    const switcherModal = document.getElementById('user-switcher-modal');
    if (userTrigger && switcherModal) {
        userTrigger.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que o clique no trigger feche o modal imediatamente pelo listener global
            switcherModal.style.display = switcherModal.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Fechar ao clicar fora ou Esc
    window.addEventListener('click', (e) => {
        // Fechar switcher de usuário
        if (switcherModal && switcherModal.style.display === 'block') {
            if (!switcherModal.contains(e.target) && !userTrigger.contains(e.target)) {
                switcherModal.style.display = 'none';
            }
        }

        // Fechar modais ao clicar no overlay (fundo escuro)
        if (e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('active');
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Fechar switcher de usuário
            if (switcherModal) switcherModal.style.display = 'none';
            
            // Fechar todos os modais ativos
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        }
    });

    // Botão Sincronizar Agenda (Manual)
    const btnSyncManual = document.getElementById('btn-sync-calendar-manual');
    if (btnSyncManual) {
        btnSyncManual.addEventListener('click', async () => {
            if (!window.currentViewedVenda) return;
            
            btnSyncManual.disabled = true;
            const originalText = btnSyncManual.innerHTML;
            btnSyncManual.innerHTML = '<span class="material-symbols-outlined spinning">sync</span> Sincronizando...';
            
            try {
                await syncVendaComGoogleCalendar(window.currentViewedVenda);
                alert("✅ Parcelas sincronizadas com sua Google Agenda!");
            } catch (err) {
                console.error("Erro na sincronização manual:", err);
                alert("❌ Erro ao sincronizar com Google Agenda. Verifique se os popups estão permitidos.");
            } finally {
                btnSyncManual.disabled = false;
                btnSyncManual.innerHTML = originalText;
            }
        });
    }

    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('crm_current_user');
            window.location.reload();
        });
    }

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('theme-dark');
        });
    }

    // Foto do Usuário (Preview)
    const photoInput = document.getElementById('user-photo-input');
    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const max = 300;
                        let w = img.width, h = img.height;
                        if (w > h) { if (w > max) { h *= max / w; w = max; } }
                        else { if (h > max) { w *= max / h; h = max; } }
                        canvas.width = w; canvas.height = h;
                        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        window.tempUserPhoto = canvas.toDataURL('image/jpeg', 0.7);
                        document.getElementById('photo-preview').innerHTML = `<img src="${window.tempUserPhoto}" style="width: 100%; height: 100%; object-fit: cover;">`;
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // --- Mobile Menu Toggle ---
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (mobileMenuBtn && sidebar && overlay) {
        const toggleMobileMenu = () => {
            sidebar.classList.toggle('mobile-active');
            overlay.classList.toggle('active');
        };

        mobileMenuBtn.onclick = toggleMobileMenu;
        overlay.onclick = toggleMobileMenu;

        // Fecha o menu ao clicar em um item da navegação no mobile
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (sidebar.classList.contains('mobile-active')) {
                    toggleMobileMenu();
                }
            });
        });
    }

    // Toggle Visibilidade de Senha no Cadastro de Usuário
    const togglePassBtn = document.getElementById('toggle-password');
    const passInput = document.getElementById('user-password');
    if (togglePassBtn && passInput) {
        togglePassBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isPrivate = passInput.type === 'password';
            passInput.type = isPrivate ? 'text' : 'password';
            togglePassBtn.querySelector('span').textContent = isPrivate ? 'visibility_off' : 'visibility';
            console.log("Toggle senha:", passInput.type);
        };
    }

    // --- Delegação de Eventos para Máscaras ---
    document.addEventListener('input', (e) => {
        // Máscara de CPF e CNPJ (Campo principal)
        if (e.target.classList.contains('cpf-cnpj-mask') || e.target.id === 'cpfCnpj') {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 11) {
                // Máscara de CPF: 000.000.000-00
                value = value.replace(/(\d{3})(\d)/, '$1.$2');
                value = value.replace(/(\d{3})(\d)/, '$1.$2');
                value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            } else {
                // Máscara de CNPJ: 00.000.000/0000-00
                value = value.substring(0, 14);
                value = value.replace(/^(\d{2})(\d)/, '$1.$2');
                value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
                value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
                value = value.replace(/(\d{4})(\d)/, '$1-$2');
            }
            e.target.value = value;
        } 
        // Máscara Apenas CPF (Dependentes, Usuários)
        else if (e.target.classList.contains('cpf-mask')) {
            let value = e.target.value.replace(/\D/g, '');
            value = value.substring(0, 11);
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            e.target.value = value;
        }
        // Máscara de Telefone
        else if (e.target.classList.contains('telefone-mask') || e.target.name === 'telefone') {
            let value = e.target.value.replace(/\D/g, '');
            value = value.substring(0, 11);
            if (value.length > 2) {
                value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
            }
            if (value.length > 9) {
                value = value.replace(/(\d{5})(\d)/, '$1-$2');
            } else if (value.length > 8) {
                value = value.replace(/(\d{4})(\d)/, '$1-$2');
            }
            e.target.value = value;
        }
        // Máscara de Moeda
        else if (e.target.classList.contains('money-mask')) {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') {
                e.target.value = '';
                return;
            }
            value = (parseInt(value, 10) / 100).toFixed(2);
            value = value.replace('.', ',');
            value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
            e.target.value = 'R$ ' + value;
        }
    });
}

// Funções Auxiliares
function exibirTelaLogin() {
    const views = document.querySelectorAll('.view-section');
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    views.forEach(v => v.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    
    document.getElementById('view-login-admin').classList.add('active');
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.top-header').style.display = 'none';
    document.querySelector('.main-content').style.marginLeft = '0';
}

function setupLoginHandler() {
    const form = document.getElementById('admin-login-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            const res = await login(email, pass);
            if (res.success) window.location.reload();
            else {
                const err = document.getElementById('login-error');
                err.textContent = res.message;
                err.style.display = 'block';
            }
        };
    }

    const btnGoogle = document.getElementById('btn-google-login');
    if (btnGoogle) {
        btnGoogle.onclick = async () => {
            const res = await loginComGoogle();
            if (res.success) window.location.reload();
            else {
                const err = document.getElementById('login-error');
                err.textContent = res.message;
                err.style.display = 'block';
            }
        };
    }
}

async function renderUsersTable() {
    const tbody = document.querySelector('#users-table tbody');
    if (!tbody) return;
    const users = await listarUsuarios();
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.foto ? `<img src="${u.foto}" style="width: 32px; height: 32px; border-radius: 50%;">` : '<span class="material-symbols-outlined">person</span>'}</td>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${u.cpf || '---'}</td>
            <td>${u.cod || '---'}</td>
            <td><span class="badge badge-${u.role === 'Administrador' ? 'primary' : 'info'}">${u.role}</span></td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-sm btn-secondary edit-user" data-id="${u.id}" title="Editar Usuário">
                        <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                    </button>
                    <button class="btn btn-sm btn-danger delete-user" data-id="${u.id}" title="Excluir Usuário">
                        <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Bind Edit/Delete
    tbody.querySelectorAll('.edit-user').forEach(btn => {
        btn.onclick = async () => {
            console.log("Botão editar clicado para o ID:", btn.dataset.id);
            const u = await buscarUsuarioPorId(btn.dataset.id);
            if (u) {
                console.log("Usuário encontrado:", u);
                const form = document.getElementById('new-user-form');
                document.getElementById('edit-user-id').value = u.id;
                form.querySelector('[name="name"]').value = u.name || '';
                form.querySelector('[name="email"]').value = u.email || '';
                form.querySelector('[name="cpf"]').value = u.cpf || '';
                form.querySelector('[name="cod"]').value = u.cod || '';
                form.querySelector('[name="role"]').value = u.role || 'Vendedor';
                form.querySelector('[name="password"]').value = u.password || '';
                
                if (u.foto) {
                    document.getElementById('photo-preview').innerHTML = `<img src="${u.foto}" style="width: 100%; height: 100%; object-fit: cover;">`;
                    window.tempUserPhoto = u.foto;
                } else {
                    document.getElementById('photo-preview').innerHTML = '<span class="material-symbols-outlined" style="font-size: 40px; color: #94a3b8;">person</span>';
                    window.tempUserPhoto = null;
                }

                // Reset visibility ao editar
                const passInput = document.getElementById('user-password');
                const toggleBtn = document.getElementById('toggle-password');
                if (passInput) passInput.type = 'password';
                if (toggleBtn) toggleBtn.querySelector('span').textContent = 'visibility';

                document.getElementById('modal-user').classList.add('active');
            }
        };
    });

    tbody.querySelectorAll('.delete-user').forEach(btn => {
        btn.onclick = async () => {
            if (confirm("Excluir usuário?")) {
                await excluirUsuario(btn.dataset.id);
                renderUsersTable();
            }
        };
    });
}

async function updateSellerSelect() {
    const sel = document.getElementById('vendedor-select');
    const fSel = document.getElementById('filter-vendedor');
    const users = await listarUsuarios();
    const sellers = users.filter(u => u.role === 'Vendedor');
    const options = '<option value="">Selecione...</option>' + sellers.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    
    if (sel) {
        sel.innerHTML = options;
        const group = document.getElementById('vendedor-selection-group');
        const user = getCurrentUser();
        if (group) group.style.display = user.role === 'Vendedor' ? 'none' : 'block';
    }
    if (fSel) fSel.innerHTML = '<option value="">Todos</option>' + sellers.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
}

function setupAdminFilters() {
    const fSel = document.getElementById('filter-vendedor');
    const group = document.getElementById('admin-filter-group');
    const user = getCurrentUser();
    if (group) group.style.display = user.role === 'Administrador' ? 'flex' : 'none';
    if (fSel) {
        fSel.onchange = () => {
            window.activeSellerFilter = fSel.value;
            atualizarEstatisticas();
        };
    }
}

function setupSidebarVisibility() {
    const user = getCurrentUser();
    const navUsers = document.getElementById('nav-users');
    if (navUsers) {
        // Se não for Admin, esconde o botão de Usuários do menu lateral
        navUsers.style.display = user.role === 'Administrador' ? 'flex' : 'none';
    }
}

async function renderUserSwitcher() {
    const cont = document.getElementById('user-list-container');
    if (!cont) return;
    
    let users = await listarUsuarios();
    const current = getCurrentUser();
    
    // REGRA DE PRIVACIDADE:
    // Se não for Admin, só mostra o próprio usuário na lista
    if (current.role !== 'Administrador') {
        users = users.filter(u => u.id === current.id);
    }
    
    cont.innerHTML = users.map(u => `
        <button class="btn-switch-user" data-id="${u.id}" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #eee; background: #fff; border-radius: 8px; margin-bottom: 5px; cursor: pointer;">
            ${u.foto ? `<img src="${u.foto}" style="width: 28px; height: 28px; border-radius: 50%;">` : '<span class="material-symbols-outlined">account_circle</span>'}
            <div style="text-align: left; flex: 1;">
                <div style="font-weight: 600;">${u.name}</div>
                <div style="font-size: 0.7rem;">${u.role}</div>
            </div>
            <span class="material-symbols-outlined" style="font-size: 16px;">${current.role === 'Administrador' ? 'visibility' : 'check_circle'}</span>
        </button>
    `).join('');

    cont.querySelectorAll('.btn-switch-user').forEach(btn => {
        btn.onclick = async () => {
            if (current.role === 'Administrador') {
                const u = await buscarUsuarioPorId(btn.dataset.id);
                const fSel = document.getElementById('filter-vendedor');
                if (fSel && u) {
                    fSel.value = u.name;
                    fSel.dispatchEvent(new Event('change'));
                    document.querySelector('.nav-item[data-target="sales"]').click();
                }
            } else {
                localStorage.removeItem('crm_current_user');
                window.location.reload();
            }
        };
    });
}

function preencherFormVenda(v) {
    console.log("Preenchendo formulário com dados da venda:", v);
    const form = document.getElementById('new-sale-form');
    
    // Campo oculto para o ID
    const idInput = document.getElementById('venda-id');
    if (idInput) idInput.value = v.id || '';
    
    document.getElementById('form-title').innerText = 'Editar Venda';
    
    // Limpar campos de dependentes antes de preencher
    const container = document.getElementById('dependentes-container');
    if (container) container.innerHTML = '';

    // Mapeamento manual para garantir que nada fique vazio
    const setVal = (name, val) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el) {
            el.value = val || '';
            // Dispara input para acionar as máscaras dinâmicas
            el.dispatchEvent(new Event('input', { bubbles: true }));
            // Dispara evento de mudança para disparar gatilhos (ex: busca de cidades)
            el.dispatchEvent(new Event('change'));
        }
    };

    setVal('vendedor', v.vendedor);
    setVal('nome', v.nome);
    setVal('email', v.email);
    setVal('telefone', v.telefone);
    setVal('cpfCnpj', v.cpfCnpj);
    setVal('numeroContrato', v.numeroContrato);
    setVal('dataVenda', v.dataVenda);
    setVal('tipoPlano', v.tipoPlano);
    const formatMoney = (val) => {
        if (!val) return '';
        let num = parseFloat(val);
        if (isNaN(num)) return val;
        let formatted = num.toFixed(2).replace('.', ',');
        formatted = formatted.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
        return 'R$ ' + formatted;
    };

    setVal('valorPlano', formatMoney(v.valorPlano));
    setVal('valorPago', formatMoney(v.valorPago));
    setVal('tipoPagamento', v.tipoPagamento);
    setVal('status', v.status);
    setVal('vencimento1', v.vencimento1);
    setVal('pagamento1', formatMoney(v.pagamento1));
    setVal('vencimento2', v.vencimento2);
    setVal('pagamento2', formatMoney(v.pagamento2));
    setVal('vencimento3', v.vencimento3);
    setVal('pagamento3', formatMoney(v.pagamento3));

    // Estado e Cidade (Requer cuidado especial por causa do carregamento via API)
    const estadoEl = document.getElementById('estado');
    if (estadoEl) {
        estadoEl.value = v.estado || '';
        // Disparar o change manualmente para carregar as cidades
        estadoEl.dispatchEvent(new Event('change'));
        
        // Pequeno atraso para dar tempo da API do IBGE carregar as cidades
        setTimeout(() => {
            const cidadeEl = document.getElementById('cidade');
            if (cidadeEl) cidadeEl.value = v.cidade || '';
        }, 800);
    }

    // Papel do Cliente (Radios)
    const papelRadios = form.querySelectorAll('input[name="papelCliente"]');
    papelRadios.forEach(r => {
        if (r.value === v.papelCliente) r.checked = true;
    });

    // Tipo de Contrato (Radios)
    const contratoRadios = form.querySelectorAll('input[name="tipoContrato"]');
    contratoRadios.forEach(r => {
        if (r.value === v.tipoContrato) r.checked = true;
    });

    // Dependentes
    if (v.dependentes && Array.isArray(v.dependentes)) {
        v.dependentes.forEach(d => {
            addDependenteRow(d.nome, d.dataNascimento, d.cpf, d.papel || 'Titular');
        });
    }
}

function exibirDetalhesVenda(v) {
    window.currentViewedVenda = v; // Armazena para sincronização manual
    const modal = document.getElementById('modal-visualizar');
    const body = modal.querySelector('.modal-body');
    
    // Formatar parcelas para exibição
    const p1 = v.pagamento1 ? `<p><strong>1ª Parcela:</strong> R$ ${v.pagamento1} (${formatDate(v.vencimento1)})</p>` : '';
    const p2 = v.pagamento2 ? `<p><strong>2ª Parcela:</strong> R$ ${v.pagamento2} (${formatDate(v.vencimento2)})</p>` : '';
    const p3 = v.pagamento3 ? `<p><strong>3ª Parcela:</strong> R$ ${v.pagamento3} (${formatDate(v.vencimento3)})</p>` : '';

    const deps = v.dependentes && v.dependentes.length > 0 ? v.dependentes.map(d => `<li>${d.nome} (${d.papel})</li>`).join('') : 'Nenhum';
    
    body.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <h4 style="color: var(--primary); margin-bottom: 10px;">Dados do Cliente</h4>
                <p><strong>Nome:</strong> ${v.nome}</p>
                <p><strong>CPF:</strong> ${v.cpfCnpj}</p>
                <p><strong>Email:</strong> ${v.email}</p>
                <p><strong>Telefone:</strong> ${v.telefone}</p>
            </div>
            <div>
                <h4 style="color: var(--primary); margin-bottom: 10px;">Dados da Venda</h4>
                <p><strong>Contrato:</strong> ${v.numeroContrato || '---'}</p>
                <p><strong>Plano:</strong> ${v.tipoPlano}</p>
                <p><strong>Vendedor:</strong> ${v.vendedor}</p>
                <p><strong>Status:</strong> <span class="badge badge-${v.status === 'Aprovado' ? 'success' : 'warning'}">${v.status}</span></p>
            </div>
        </div>
        <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <h4 style="color: var(--primary); margin-bottom: 10px;">Pagamentos</h4>
                ${p1} ${p2} ${p3}
            </div>
            <div>
                <h4 style="color: var(--primary); margin-bottom: 10px;">Dependentes</h4>
                <ul style="padding-left: 20px;">${deps}</ul>
            </div>
        </div>
    `;
    modal.classList.add('active');
}

/**
 * Função utilitária para sincronizar parcelas de uma venda com o Google Calendar
 */
async function syncVendaComGoogleCalendar(venda) {
    console.log("Iniciando sincronização com Google Calendar...");
    const pagamentos = [
        { valor: venda.pagamento1 || venda.valor1, data: venda.vencimento1, num: 1 },
        { valor: venda.pagamento2 || venda.valor2, data: venda.vencimento2, num: 2 },
        { valor: venda.pagamento3 || venda.valor3, data: venda.vencimento3, num: 3 }
    ];

    for (const p of pagamentos) {
        if (p.data && p.valor) {
            try {
                await createPaymentEvent(venda, p.num, p.data, p.valor);
                console.log(`✅ Lembrete da parcela ${p.num} criado.`);
            } catch (calErr) {
                console.error(`❌ Erro na parcela ${p.num}:`, calErr);
                throw calErr; // Propaga para o chamador tratar (ex: mostrar alert)
            }
        }
    }
}

function setupLocationAPI() {
    const estadoSelect = document.getElementById('estado');
    const cidadeSelect = document.getElementById('cidade');

    if (estadoSelect && cidadeSelect) {
        // Se já tiver opções (além da padrão), não busca de novo
        if (estadoSelect.options.length > 1) return;

        console.log("Buscando estados do IBGE...");
        estadoSelect.innerHTML = '<option value="">Carregando...</option>';

        fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
            .then(response => {
                if (!response.ok) throw new Error("Erro na rede");
                return response.json();
            })
            .then(estados => {
                estadoSelect.innerHTML = '<option value="">Selecione...</option>';
                estados.forEach(estado => {
                    const option = document.createElement('option');
                    option.value = estado.sigla; 
                    option.textContent = estado.nome;
                    estadoSelect.appendChild(option);
                });
                console.log(`${estados.length} estados carregados.`);
            })
            .catch(error => {
                console.error('Erro ao buscar estados:', error);
                estadoSelect.innerHTML = '<option value="">Erro ao carregar (tente recarregar a página)</option>';
            });

        // Buscar Cidades ao mudar o Estado
        estadoSelect.addEventListener('change', () => {
            const uf = estadoSelect.value;
            if (!uf) {
                cidadeSelect.innerHTML = '<option value="">Selecione um estado primeiro</option>';
                cidadeSelect.disabled = true;
                return;
            }

            cidadeSelect.innerHTML = '<option value="">Carregando...</option>';
            cidadeSelect.disabled = true;

            fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
                .then(response => response.json())
                .then(cidades => {
                    cidadeSelect.innerHTML = '<option value="">Selecione a cidade...</option>';
                    cidades.forEach(cidade => {
                        const option = document.createElement('option');
                        option.value = cidade.nome;
                        option.textContent = cidade.nome;
                        cidadeSelect.appendChild(option);
                    });
                    cidadeSelect.disabled = false;
                })
                .catch(error => {
                    console.error('Erro ao buscar cidades:', error);
                    cidadeSelect.innerHTML = '<option value="">Erro ao carregar</option>';
                });
        });
    }
}

function addDependenteRow(nome = '', dataNasc = '', cpf = '', papel = 'Titular') {
    const container = document.getElementById('dependentes-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'dependent-row';
    row.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;';
    
    row.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 1.5rem; background: #fff; padding: 6px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.85rem;">
                    <input type="radio" name="depPapel_${Date.now()}" value="Titular" ${papel === 'Titular' ? 'checked' : ''}> Titular
                </label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.85rem;">
                    <input type="radio" name="depPapel_${Date.now()}" value="Dependente" ${papel === 'Dependente' ? 'checked' : ''}> Dependente
                </label>
            </div>
            <button type="button" class="btn-remove-dep" style="background: #fee2e2; color: #ef4444; border: none; padding: 6px; border-radius: 6px; cursor: pointer;">
                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
            </button>
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px;">
            <input type="text" name="dependenteNome[]" value="${nome}" placeholder="Nome do Dependente" style="padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
            <input type="date" name="dependenteNascimento[]" value="${dataNasc}" style="padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
            <input type="text" name="dependenteCpf[]" value="${cpf}" placeholder="CPF" class="cpf-mask" style="padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
        </div>
    `;

    row.querySelector('.btn-remove-dep').onclick = () => row.remove();
    container.appendChild(row);

    // Disparar input para formatar máscara caso venha preenchido (edição)
    const cpfInput = row.querySelector('.cpf-mask');
    if (cpfInput && cpfInput.value) {
        cpfInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
