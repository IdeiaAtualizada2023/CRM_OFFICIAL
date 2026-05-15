// Serviço de Dados - Lidará com o Cloud Firestore
import { db } from './firebaseConfig.js';
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
import { getCurrentUser } from './authService.js';

const COLLECTION_NAME = 'vendas';

export async function carregarVendas() {
    console.log("Carregando vendas do Firestore...");
    const user = getCurrentUser();
    let vendas = [];


    try {
        const vendasRef = collection(db, COLLECTION_NAME);
        let q = query(vendasRef); // Consulta mais simples possível para evitar erros

        if (user && user.role === 'Administrador') {
            if (window.activeSellerFilter && window.activeSellerFilter !== 'Todos') {
                q = query(vendasRef, where('vendedor', '==', window.activeSellerFilter));
            }
        } else if (user && user.role === 'Vendedor') {
            q = query(vendasRef, where('vendedor', '==', user.name));
        }

        console.log("Executando busca no Firestore...");
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            vendas.push({ id: doc.id, ...doc.data() });
        });
        
        console.log(`Sucesso: ${vendas.length} vendas encontradas.`);

        // Ordenar localmente com tratamento para datas inválidas
        vendas.sort((a, b) => {
            const dateA = new Date(a.dataVenda || 0);
            const dateB = new Date(b.dataVenda || 0);
            return dateB - dateA;
        });

        // Migração apenas se realmente não houver nada no banco e nada local
        if (vendas.length === 0 && !window.migratedOnce) {
            const localData = localStorage.getItem('sales_data');
            if (localData) {
                console.log("Iniciando migração de emergência...");
                const backup = JSON.parse(localData);
                if (backup.length > 0) {
                    window.migratedOnce = true;
                    for (const item of backup) {
                        await salvarVenda(item, false);
                    }
                    return carregarVendas();
                }
            }
        }

    } catch (e) {
        console.error("Erro ao carregar do Firestore:", e);
        // Alerta o usuário sobre o problema de conexão
        alert("⚠️ Atenção: Não foi possível carregar os dados do Banco de Dados Online. \nMotivo: " + e.message + "\n\nO sistema exibirá dados locais temporários.");
        
        const localData = localStorage.getItem('sales_data');
        if (localData) {
            vendas = JSON.parse(localData);
            // Garante que cada venda local tenha um ID para não quebrar o botão
            vendas = vendas.map((v, index) => ({
                ...v,
                id: v.id || v.ID || `local-${index}`
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
            await addDoc(vendasRef, vendaData);
            console.log("✅ Nova venda criada no Firestore.");
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
            await atualizarEstatisticas();
        }
        return true;
    } catch (e) {
        console.error("Erro ao mudar status:", e);
        return false;
    }
}

let livesChart = null;

export async function atualizarEstatisticas() {
    const vendas = await carregarVendas();
    
    // Contagens
    const total = vendas.length;
    const concluidasVendas = vendas.filter(v => v.status === "Aprovado" || v.status === "Pago");
    const concluidas = concluidasVendas.length;
    const pendentes = vendas.filter(v => v.status === "Pendente" || !v.status).length;
    const canceladas = vendas.filter(v => v.status === "Cancelado").length;

    // Valores
    let faturamento = 0;
    let perdido = 0;
    let totalVidas = 0;

    vendas.forEach(v => {
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

    // Atualizar UI
    // Atualizar UI
    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.textContent = val;
    };

    setEl('stat-total-sales', total);
    setEl('stat-completed', concluidas);
    setEl('stat-pending', pendentes);
    setEl('stat-canceled', canceladas);
    setEl('stat-total-value', formatCurrency(faturamento));
    setEl('stat-lost-value', formatCurrency(perdido));
    setEl('stat-avg-ticket', formatCurrency(avgTicket));
    setEl('stat-total-lives', totalVidas);

    renderTables(vendas);
    renderLivesChart(vendas);
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

function renderTables(vendas) {
    console.log("Renderizando tabelas com", vendas.length, "vendas");
    const allSalesTable = document.querySelector('#all-sales-table tbody');
    
    if (allSalesTable) {
        allSalesTable.innerHTML = '';
        if (!vendas || vendas.length === 0) {
            allSalesTable.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px; color: var(--text-muted);">📭 Nenhuma venda encontrada no banco de dados.</td></tr>';
        } else {
            vendas.forEach(v => {
                const tr = document.createElement('tr');
                const status = v.status || 'Pendente';
                const statusClass = status.toLowerCase() === 'aprovado' ? 'success' : (status.toLowerCase() === 'cancelado' ? 'danger' : 'warning');
                
                tr.innerHTML = `
                    <td>${formatDate(v.dataVenda || v.Data)}</td>
                    <td style="font-weight: 600; color: #4361ee;">${v.numeroContrato || '---'}</td>
                    <td>${v.nome || v.Nome}</td>
                    <td>${maskCPF(v.cpfCnpj || v.cpf)}</td>
                    <td>${v.email || '---'}</td>
                    <td>${maskPhone(v.telefone)}</td>
                    <td>${v.estado || '---'}</td>
                    <td>${v.cidade || '---'}</td>
                    <td><span class="badge badge-${statusClass}">${status}</span></td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-sm btn-primary action-edit" data-vendaid="${v.id}" title="Editar Venda">
                                <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                            </button>
                            <button class="btn btn-sm btn-warning action-status" data-vendaid="${v.id}" title="Alterar Status" style="background-color: #f59e0b; color: white; border: none;">
                                <span class="material-symbols-outlined" style="font-size: 16px;">published_with_changes</span>
                            </button>
                            <button class="btn btn-sm btn-danger action-delete" data-vendaid="${v.id}" title="Excluir Venda" style="background-color: #ef4444; color: white; border: none;">
                                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
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
        if (vendas && vendas.length > 0) {
            vendas.slice(0, 5).forEach(v => {
                const tr = document.createElement('tr');
                const status = v.status || 'Pendente';
                const statusClass = status.toLowerCase() === 'aprovado' ? 'success' : (status.toLowerCase() === 'cancelado' ? 'danger' : 'warning');
                tr.innerHTML = `
                    <td>${formatDate(v.dataVenda || v.Data)}</td>
                    <td>${v.nome || v.Nome}</td>
                    <td style="font-family: 'Courier New', monospace; font-weight: bold;">${formatCurrency(parseFloat(v.valorPlano || v.valor || 0))}</td>
                    <td><span class="badge badge-${statusClass}">${status}</span></td>
                `;
                recentSalesTable.appendChild(tr);
            });
        }
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
