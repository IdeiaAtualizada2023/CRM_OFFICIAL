// Serviço de Dados - Lidará com o Cloud Firestore
import { db } from './firebaseConfig.js?v=3.2';
import { 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getCurrentUser } from './authService.js?v=3.2';

const COLLECTION_NAME = 'vendas';
let cacheVendas = [];

export async function carregarVendas() {
    console.log("Iniciando carga de vendas (Firestore)...");
    let vendas = [];
    const user = getCurrentUser();

    try {
        const vendasRef = collection(db, COLLECTION_NAME);
        let q = query(vendasRef);

        // Aplicação de Filtros de Segurança
        if (user && user.role === 'Vendedor') {
            q = query(vendasRef, where('vendedor', '==', user.name));
        } else if (window.activeSellerFilter && window.activeSellerFilter !== 'Todos') {
            q = query(vendasRef, where('vendedor', '==', window.activeSellerFilter));
        }

        // Proteção contra travamento (Timeout de 6 segundos)
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Tempo de conexão esgotado (Timeout)")), 6000)
        );

        console.log("Executando busca no Firestore com proteção de timeout...");
        const querySnapshot = await Promise.race([getDocs(q), timeoutPromise]);
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            vendas.push({ 
                ...data,
                id: doc.id // ID vindo do Firebase
            });
        });

        console.log(`Carga finalizada: ${vendas.length} registros.`);

        // Migração automática (apenas se o banco estiver zerado)
        if (vendas.length === 0 && !window.migratedOnce) {
            window.migratedOnce = true;
            const localData = localStorage.getItem('sales_data');
            if (localData) {
                const backup = JSON.parse(localData);
                console.log(`Migrando ${backup.length} registros locais...`);
                for (const item of backup) {
                    await salvarVenda(item, false);
                }
                return await carregarVendas(); // Recarrega após migrar
            }
        }

    } catch (e) {
        console.error("Erro Crítico Firestore:", e);
        // Fallback local se o servidor estiver inacessível
        const localData = localStorage.getItem('sales_data');
        if (localData) {
            vendas = JSON.parse(localData).map((v, i) => ({
                ...v,
                id: v.id || v.ID || `offline-${i}`
            }));
        }
    }

    return vendas;
}

export async function salvarVenda(vendaData, updateStats = true) {
    try {
        const vendasRef = collection(db, COLLECTION_NAME);
        
        // Limpeza de campos undefined para o Firestore não reclamar
        Object.keys(vendaData).forEach(key => vendaData[key] === undefined && delete vendaData[key]);

        if (vendaData.id && vendaData.id.trim() !== "") { 
            const docId = vendaData.id;
            const dataToUpdate = { ...vendaData };
            delete dataToUpdate.id; 
            const docRef = doc(db, COLLECTION_NAME, docId);
            await updateDoc(docRef, dataToUpdate);
            console.log("✅ Venda atualizada no Firestore:", docId);
        } else {
            if (vendaData.hasOwnProperty('id')) delete vendaData.id; 
            
            // CRIANDO ID AMIGÁVEL: Usa o Número do Contrato como nome do documento no Firebase
            const customId = vendaData.numeroContrato ? String(vendaData.numeroContrato).trim() : `venda-${Date.now()}`;
            
            await setDoc(doc(db, COLLECTION_NAME, customId), vendaData);
            console.log("✅ Nova venda criada com ID de Contrato:", customId);
        }
        
        if (updateStats) {
            await atualizarEstatisticas();
        }
        return true;
    } catch (e) {
        console.error("Erro detalhado ao salvar no Firestore:", e);
        throw e;
    }
}

export async function getVenda(id) {
    try {
        const docRef = doc(db, COLLECTION_NAME, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
    } catch (e) {
        console.error("Erro ao buscar venda:", e);
        if (e.code === 'permission-denied') {
            alert("❌ Erro de Permissão ao buscar dados: O domínio rajacrm.site pode não estar autorizado no Firebase ou sua sessão expirou.");
        }
    }
    return null;
}

export async function excluirVenda(id) {
    if (!id) {
        console.error("ID inválido para exclusão");
        return false;
    }
    try {
        const docRef = doc(db, COLLECTION_NAME, id);
        console.log("🔥 Solicitando exclusão do documento:", id);
        await deleteDoc(docRef);
        console.log("✅ Documento excluído com sucesso do Firestore.");
        return true;
    } catch (e) {
        console.error("❌ Erro fatal ao excluir do Firestore:", e);
        // Tenta alertar o motivo se possível (ex: falta de permissão)
        if (e.code === 'permission-denied') {
            alert("Erro: Você não tem permissão para excluir esta venda.");
        }
        return false;
    }
}

export async function toggleStatusVenda(id) {
    try {
        const venda = await getVenda(id);
        if (venda) {
            const currentStatus = venda.status || 'Pendente';
            let newStatus = currentStatus === 'Pendente' ? 'Aprovado' : (currentStatus === 'Aprovado' ? 'Cancelado' : 'Pendente');
            
            const docRef = doc(db, COLLECTION_NAME, id);
            await updateDoc(docRef, { status: newStatus });
            return true;
        }
        return false;
    } catch (e) {
        console.error("Erro ao mudar status:", e);
        if (e.code === 'permission-denied') {
            alert("❌ Erro de Permissão: O Firebase bloqueou a alteração. Verifique se você está logado corretamente e se o domínio rajacrm.site está autorizado.");
        }
        return false;
    }
}

let livesChart = null;
let sourcesChart = null;

export function extrairAnoMes(dateStr) {
    if (!dateStr || dateStr === '-') return null;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return {
                ano: parseInt(parts[2], 10),
                mes: parseInt(parts[1], 10)
            };
        }
    }
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return {
            ano: parseInt(parts[0], 10),
            mes: parseInt(parts[1], 10)
        };
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        return {
            ano: d.getFullYear(),
            mes: d.getMonth() + 1
        };
    }
    return null;
}

export function calcularEstatisticasParaVendas(vendasFiltradas) {
    const total = vendasFiltradas.length;
    const concluidasVendas = vendasFiltradas.filter(v => v.status === "Aprovado" || v.status === "Pago");
    const concluidas = concluidasVendas.length;
    const pendentes = vendasFiltradas.filter(v => v.status === "Pendente" || !v.status).length;
    const canceladas = vendasFiltradas.filter(v => v.status === "Cancelado").length;

    let faturamento = 0;
    let perdido = 0;
    let totalVidas = 0;

    vendasFiltradas.forEach(v => {
        const valor = parseFloat(v.valorPlano || v.valor || 0);
        const isConcluida = v.status === "Aprovado" || v.status === "Pago";
        
        if (isConcluida) {
            faturamento += valor;
            if (v.papelCliente !== 'Responsável') totalVidas += 1;
            if (v.dependentes) totalVidas += v.dependentes.length;
        } else if (v.status === "Cancelado") {
            perdido += valor;
        }
    });

    const avgTicket = concluidas > 0 ? faturamento / concluidas : 0;

    return {
        total,
        concluidas,
        pendentes,
        canceladas,
        faturamento,
        perdido,
        totalVidas,
        avgTicket
    };
}

function renderizarEstatisticasNosCards(stats, prefix = '') {
    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setEl(prefix + 'stat-total-sales', stats.total);
    setEl(prefix + 'stat-completed', stats.concluidas);
    setEl(prefix + 'stat-pending', stats.pendentes);
    setEl(prefix + 'stat-canceled', stats.canceladas);
    setEl(prefix + 'stat-total-value', formatCurrency(stats.faturamento));
    setEl(prefix + 'stat-lost-value', formatCurrency(stats.perdido));
    setEl(prefix + 'stat-total-lives', stats.totalVidas);
    setEl(prefix + 'stat-avg-ticket', formatCurrency(stats.avgTicket));
}

export function atualizarCardsHistorico(vendas) {
    const selectHistorico = document.getElementById('filter-historico-mes');
    if (!selectHistorico) return;

    const filtro = selectHistorico.value;
    let vendasFiltradas = vendas;

    if (filtro && filtro !== 'todos') {
        const [anoFiltro, mesFiltro] = filtro.split('-').map(num => parseInt(num, 10));
        vendasFiltradas = vendas.filter(v => {
            const dataInfo = extrairAnoMes(v.dataVenda || v.Data);
            return dataInfo && dataInfo.ano === anoFiltro && dataInfo.mes === mesFiltro;
        });
    }

    const statsHistorico = calcularEstatisticasParaVendas(vendasFiltradas);
    renderizarEstatisticasNosCards(statsHistorico, 'hist-');
}

export async function atualizarEstatisticas() {
    const vendas = await carregarVendas();
    cacheVendas = vendas;
    
    // 1. Identificar mês/ano atuais
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1; // 1-12
    const nomesMeses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    const elMonthName = document.getElementById('current-month-name');
    if (elMonthName) {
        elMonthName.textContent = `${nomesMeses[hoje.getMonth()]} / ${anoAtual}`;
    }

    // 2. Filtrar vendas do mês atual
    const vendasMesAtual = vendas.filter(v => {
        const dataInfo = extrairAnoMes(v.dataVenda || v.Data);
        return dataInfo && dataInfo.ano === anoAtual && dataInfo.mes === mesAtual;
    });

    // 3. Atualizar cards superiores (Mês Atual)
    const statsMesAtual = calcularEstatisticasParaVendas(vendasMesAtual);
    renderizarEstatisticasNosCards(statsMesAtual, '');

    // 4. Popular dinamicamente o select de histórico
    const periodos = [];
    vendas.forEach(v => {
        const dataInfo = extrairAnoMes(v.dataVenda || v.Data);
        if (dataInfo) {
            const chave = `${dataInfo.ano}-${String(dataInfo.mes).padStart(2, '0')}`;
            if (!periodos.includes(chave)) {
                periodos.push(chave);
            }
        }
    });

    // Ordenar períodos (mais recentes primeiro)
    periodos.sort().reverse();

    const selectHistorico = document.getElementById('filter-historico-mes');
    if (selectHistorico) {
        const valorSelecionadoOriginal = selectHistorico.value;
        selectHistorico.innerHTML = '<option value="todos">Geral (Todo o período)</option>';
        
        periodos.forEach(p => {
            const [ano, mesStr] = p.split('-');
            const mesIdx = parseInt(mesStr, 10) - 1;
            const nomeMes = nomesMeses[mesIdx];
            const option = document.createElement('option');
            option.value = p;
            option.textContent = `${nomeMes} de ${ano}`;
            selectHistorico.appendChild(option);
        });

        // Restaurar valor selecionado
        if (valorSelecionadoOriginal && [...selectHistorico.options].some(opt => opt.value === valorSelecionadoOriginal)) {
            selectHistorico.value = valorSelecionadoOriginal;
        } else {
            selectHistorico.value = 'todos';
        }
    }

    // 5. Atualizar cards inferiores (Histórico/Acumulado)
    atualizarCardsHistorico(vendas);

    renderTables(vendas);
    renderLivesChart(vendas);
    renderSourcesStats(vendas);
}

function renderLivesChart(vendas) {
    const ctx = document.getElementById('livesChart');
    if (!ctx) return;

    const monthlyData = {};
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    months.forEach(m => monthlyData[m] = 0);

    vendas.filter(v => v.status === "Aprovado" || v.status === "Pago").forEach(v => {
        const date = new Date(v.dataVenda || v.Data);
        if (!isNaN(date)) {
            const monthLabel = months[date.getMonth()];
            let vidasNaVenda = (v.papelCliente !== 'Responsável' ? 1 : 0);
            if (v.dependentes) vidasNaVenda += v.dependentes.length;
            monthlyData[monthLabel] += vidasNaVenda;
        }
    });

    if (livesChart) livesChart.destroy();
    livesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Vidas Vendidas',
                data: Object.values(monthlyData),
                borderColor: '#4361ee',
                backgroundColor: 'rgba(67, 97, 238, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#4361ee'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            }
        }
    });
}

function normalizarTexto(txt) {
    if (!txt) return '';
    return String(txt).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function renderTables(vendas) {
    console.log("Renderizando tabelas profissionais...");
    
    // Ordenação Decrescente (Mais recentes primeiro)
    const vendasOrdenadas = [...vendas].sort((a, b) => {
        const dateA = a.dataVenda ? new Date(a.dataVenda) : new Date(0);
        const dateB = b.dataVenda ? new Date(b.dataVenda) : new Date(0);
        return dateB - dateA;
    });

    const allSalesTable = document.querySelector('#all-sales-table tbody');
    
    // Filtro de busca global
    const searchInput = document.getElementById('global-search');
    const queryText = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    let vendasFiltradas = vendasOrdenadas;
    if (queryText) {
        const queryNormalized = normalizarTexto(queryText);
        const queryTerms = queryNormalized.split(/\s+/).filter(t => t.length > 0);
        
        if (queryTerms.length > 0) {
            vendasFiltradas = vendasOrdenadas.filter(v => {
                const nomeNorm = normalizarTexto(v.nome);
                const emailNorm = normalizarTexto(v.email);
                const contratoNorm = normalizarTexto(v.numeroContrato);
                const vendedorNorm = normalizarTexto(v.vendedor);
                const cidadeNorm = normalizarTexto(v.cidade);
                const estadoNorm = normalizarTexto(v.estado);
                const statusNorm = normalizarTexto(v.status);
                
                const cpfClean = v.cpfCnpj ? v.cpfCnpj.replace(/\D/g, '') : '';
                const cpfNorm = normalizarTexto(v.cpfCnpj);
                
                return queryTerms.every(term => {
                    const termClean = term.replace(/\D/g, '');
                    if (termClean.length > 0) {
                        if (cpfClean.includes(termClean)) return true;
                        if (contratoNorm.includes(termClean)) return true;
                    }
                    return nomeNorm.includes(term) ||
                           emailNorm.includes(term) ||
                           vendedorNorm.includes(term) ||
                           cidadeNorm.includes(term) ||
                           estadoNorm.includes(term) ||
                           statusNorm.includes(term) ||
                           contratoNorm.includes(term) ||
                           cpfNorm.includes(term);
                });
            });
        }
    }

    if (allSalesTable) {
        allSalesTable.innerHTML = '';
        if (!vendasFiltradas || vendasFiltradas.length === 0) {
            allSalesTable.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: #94a3b8;">Nenhuma venda encontrada.</td></tr>';
        } else {
            vendasFiltradas.forEach(v => {
                const tr = document.createElement('tr');
                const status = v.status || 'Pendente';
                const statusClass = status.toLowerCase() === 'aprovado' ? 'success' : (status.toLowerCase() === 'cancelado' ? 'danger' : 'warning');
                
                tr.innerHTML = `
                    <td>${formatDate(v.dataVenda)}</td>
                    <td style="font-weight: 600; color: #4361ee;">${v.numeroContrato || '---'}</td>
                    <td style="font-weight: 500;">${v.nome}</td>
                    <td>${maskCPF(v.cpfCnpj)}</td>
                    <td style="font-size: 0.85rem; color: #64748b;">${v.email}</td>
                    <td>${maskPhone(v.telefone)}</td>
                    <td>${v.estado || '---'}</td>
                    <td>${v.cidade || '---'}</td>
                    <td><span class="badge badge-${statusClass}">${status}</span></td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-sm btn-primary action-edit" data-vendaid="${v.id}" title="Editar Venda" style="padding: 6px; border-radius: 8px;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                            </button>
                            <button class="btn btn-sm btn-warning action-status" data-vendaid="${v.id}" title="Alterar Status" style="background-color: #f59e0b; color: white; border: none; padding: 6px; border-radius: 8px;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">published_with_changes</span>
                            </button>
                            <button class="btn btn-sm btn-danger action-delete" data-vendaid="${v.id}" title="Excluir Venda" style="background-color: #ef4444; color: white; border: none; padding: 6px; border-radius: 8px;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                            </button>
                        </div>
                    </td>
                `;
                allSalesTable.appendChild(tr);
            });
        }
    }

    const recentSalesTable = document.querySelector('#recent-sales-table tbody');
    if (recentSalesTable) {
        recentSalesTable.innerHTML = '';
        vendasFiltradas.slice(0, 5).forEach(v => {
            const tr = document.createElement('tr');
            const status = v.status || 'Pendente';
            const statusClass = status.toLowerCase() === 'aprovado' ? 'success' : (status.toLowerCase() === 'cancelado' ? 'danger' : 'warning');
            tr.innerHTML = `
                <td>${formatDate(v.dataVenda)}</td>
                <td style="font-weight: 500;">${v.nome}</td>
                <td style="font-weight: 600; color: #059669;">${v.vendedor || '---'}</td>
                <td><span class="badge badge-${statusClass}">${status}</span></td>
            `;
            recentSalesTable.appendChild(tr);
        });
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function maskCPF(cpf) {
    if (!cpf || cpf === '-') return cpf;
    const clean = cpf.replace(/\D/g, '');
    return clean.length >= 11 ? `***.***.***-${clean.slice(-2)}` : cpf;
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return dateStr;
    if (dateStr.includes('/')) return dateStr;
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date.toLocaleDateString('pt-BR');
    } catch(e) {}
    return dateStr;
}

function maskPhone(phone) {
    if (!phone || phone === '-') return phone;
    const clean = phone.replace(/\D/g, '');
    return clean.length >= 10 ? `(***) *****-${clean.slice(-4)}` : phone;
}

function renderSourcesStats(vendas) {
    const ctx = document.getElementById('sourcesChart');
    const tbody = document.querySelector('#sources-ranking-table tbody');
    if (!ctx && !tbody) return;

    const statsBySource = {};
    const vendasValidas = vendas.filter(v => v.status === "Aprovado" || v.status === "Pago");

    vendasValidas.forEach(v => {
        const fonte = v.fonteVenda || 'Não Informada';
        const valor = parseFloat(v.valorPlano || v.valor || 0);
        
        if (!statsBySource[fonte]) {
            statsBySource[fonte] = { count: 0, valorTotal: 0 };
        }
        statsBySource[fonte].count += 1;
        statsBySource[fonte].valorTotal += valor;
    });

    const sortedSources = Object.keys(statsBySource).map(fonte => ({
        fonte,
        count: statsBySource[fonte].count,
        valorTotal: statsBySource[fonte].valorTotal
    })).sort((a, b) => b.count - a.count || b.valorTotal - a.valorTotal);

    const colors = [
        '#4361ee', '#3f37c9', '#4cc9f0', '#4895ef', 
        '#560bad', '#7209b7', '#b5179e', '#f72585', 
        '#2ecc71', '#27ae60', '#f39c12', '#e67e22', 
        '#e74c3c', '#1abc9c'
    ];

    if (tbody) {
        tbody.innerHTML = '';
        if (sortedSources.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 40px; color: #94a3b8;">Nenhuma venda concluída encontrada.</td></tr>';
        } else {
            sortedSources.forEach((s, idx) => {
                const bulletColor = colors[idx % colors.length];
                const tr = document.createElement('tr');
                
                // Usando display: flex para alinhar o bullet com o texto
                tr.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${bulletColor}; flex-shrink: 0;"></span>
                            <span>${s.fonte}</span>
                        </div>
                    </td>
                    <td style="text-align: center; font-weight: 600; color: var(--primary);">${s.count}</td>
                    <td style="text-align: right; font-weight: 500; color: #059669;">${formatCurrency(s.valorTotal)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    if (ctx) {
        if (sourcesChart) sourcesChart.destroy();
        
        if (sortedSources.length === 0) {
            const chartCtx = ctx.getContext('2d');
            chartCtx.clearRect(0, 0, ctx.width, ctx.height);
            chartCtx.font = "14px 'Outfit', sans-serif";
            chartCtx.fillStyle = "#94a3b8";
            chartCtx.textAlign = "center";
            chartCtx.fillText("Sem dados de vendas para exibir", ctx.width / 2, ctx.height / 2);
            return;
        }

        const labels = sortedSources.map(s => s.fonte);
        const data = sortedSources.map(s => s.count);
        
        sourcesChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: 'var(--bg-surface)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const val = context.raw || 0;
                                const total = context.dataset.data.reduce((acc, curr) => acc + curr, 0);
                                const percentage = ((val / total) * 100).toFixed(1);
                                return ` ${label}: ${val} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }
}

export function aplicarBuscaGlobal() {
    renderTables(cacheVendas);
}
