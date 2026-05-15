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
        let q;
        if (user.role === 'Administrador') {
            q = query(vendasRef); // Simplificado (sem orderBy por enquanto para evitar erro de índice)
            if (window.activeSellerFilter) {
                q = query(vendasRef, where('vendedor', '==', window.activeSellerFilter));
            }
        } else {
            q = query(vendasRef, where('vendedor', '==', user.name));
        }

        const querySnapshot = await getDocs(q);
        const vendas = [];
        querySnapshot.forEach((doc) => {
            vendas.push({ id: doc.id, ...doc.data() });
        });
        
        // Ordenar localmente para evitar necessidade de índices compostos no Firestore
        vendas.sort((a, b) => new Date(b.dataVenda) - new Date(a.dataVenda));

        // Se o banco estiver vazio, tenta carregar o backup local uma vez (migração)
        if (vendas.length === 0 && !window.migratedOnce) {
            const localData = localStorage.getItem('sales_data');
            if (localData) {
                window.migratedOnce = true; // Marca ANTES de começar para evitar loop
                console.log("Migrando dados locais para o Firestore...");
                const backup = JSON.parse(localData);
                for (const item of backup) {
                    await salvarVenda(item, false); // Passamos false para não atualizar estatísticas em loop
                }
                return carregarVendas(); // Recarrega do Firestore agora com dados
            }
        }

    } catch (e) {
        console.error("Erro ao carregar do Firestore:", e);
        // Fallback para localStorage se der erro (ex: offline)
        const localData = localStorage.getItem('sales_data');
        if (localData) vendas = JSON.parse(localData);
    }

    return vendas;
}

export async function salvarVenda(vendaData, updateStats = true) {
    try {
        const vendasRef = collection(db, COLLECTION_NAME);
        
        // Limpeza de campos undefined para o Firestore não reclamar
        Object.keys(vendaData).forEach(key => vendaData[key] === undefined && delete vendaData[key]);

        if (vendaData.id && vendaData.id.length > 15) { // IDs do Firestore são longos
            const docRef = doc(db, COLLECTION_NAME, vendaData.id);
            const id = vendaData.id;
            const dataToUpdate = { ...vendaData };
            delete dataToUpdate.id; 
            await updateDoc(docRef, dataToUpdate);
        } else {
            if (vendaData.id) delete vendaData.id; 
            await addDoc(vendasRef, vendaData);
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
    try {
        const docRef = doc(db, COLLECTION_NAME, id);
        console.log("Deletando documento:", docRef.path);
        await deleteDoc(docRef);
        return true;
    } catch (e) {
        console.error("Erro ao excluir:", e);
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
    const allSalesTable = document.querySelector('#all-sales-table tbody');
    if (allSalesTable) {
        allSalesTable.innerHTML = '';
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
                        <button class="btn btn-sm btn-primary action-edit" data-id="${v.id}"><span class="material-symbols-outlined" style="font-size: 16px;">edit</span></button>
                        <button class="btn btn-sm btn-warning action-status" data-id="${v.id}" style="background-color: #f59e0b; color: white; border: none;"><span class="material-symbols-outlined" style="font-size: 16px;">published_with_changes</span></button>
                        <button class="btn btn-sm btn-danger action-delete" data-id="${v.id}" style="background-color: #ef4444; color: white; border: none;"><span class="material-symbols-outlined" style="font-size: 16px;">delete</span></button>
                    </div>
                </td>
            `;
            allSalesTable.appendChild(tr);
        });
    }

    const recentSalesTable = document.querySelector('#recent-sales-table tbody');
    if (recentSalesTable) {
        recentSalesTable.innerHTML = '';
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

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function maskCPF(cpf) {
    if (!cpf || cpf === '-') return cpf;
    const clean = cpf.replace(/\D/g, '');
    return clean.length >= 11 ? `***.***.***-${clean.slice(-2)}` : cpf;
}

function maskPhone(phone) {
    if (!phone || phone === '-') return phone;
    const clean = phone.replace(/\D/g, '');
    return clean.length >= 10 ? `(***) *****-${clean.slice(-4)}` : phone;
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return dateStr;
    if (dateStr.includes('/')) return dateStr;
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch(e) {}
    return dateStr;
}

document.addEventListener('DOMContentLoaded', atualizarEstatisticas);
