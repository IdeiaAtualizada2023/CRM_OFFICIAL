import { 
    collection, 
    getDocs, 
    doc, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth } from './firebaseConfig.js';
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const AUTH_KEY = 'crm_current_user';
const COLLECTION_USERS = 'usuarios';

// Usuários padrão (backup caso o banco esteja vazio)
const INITIAL_USERS = [
    { id: 'admin-001', username: 'admin', name: 'Administrador Principal', role: 'Administrador', cpf: '000.000.000-00', cod: '000', avatar: 'person', email: 'admin@amels.com', password: 'admin123' }
];

let cachedUsers = [];

export async function listarUsuarios() {
    try {
        const querySnapshot = await getDocs(collection(db, COLLECTION_USERS));
        const users = [];
        querySnapshot.forEach((doc) => {
            // O ID do documento deve vir por último para garantir que sobrescreva 
            // qualquer campo "id" vazio que possa existir nos dados do documento
            users.push({ ...doc.data(), id: doc.id });
        });

        if (users.length === 0) {
            console.log("Banco de usuários vazio. Criando administrador padrão...");
            const admin = INITIAL_USERS[0];
            await cadastrarUsuario(admin);
            return [admin];
        }

        cachedUsers = users;
        return users;
    } catch (e) {
        console.error("Erro ao listar usuários:", e);
        return [];
    }
}

export async function buscarUsuarioPorEmail(email) {
    try {
        const usersRef = collection(db, COLLECTION_USERS);
        const q = query(usersRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            return { id: userDoc.id, ...userDoc.data() };
        }
    } catch (e) {
        console.error("Erro ao buscar usuário por email:", e);
    }
    return null;
}

export async function login(email, password) {
    try {
        // 1. Tenta autenticar no Firebase Auth nativo
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        // 2. Busca dados complementares (role, cpf, etc) no Firestore
        const userData = await buscarUsuarioPorEmail(email);
        
        if (userData) {
            localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
            return { success: true, user: userData };
        } else {
            // Caso raro: tem no Auth mas não no Firestore
            const newUser = { 
                name: firebaseUser.displayName || email.split('@')[0], 
                email: email, 
                role: 'Vendedor',
                cod: '---'
            };
            const created = await cadastrarUsuario(newUser);
            localStorage.setItem(AUTH_KEY, JSON.stringify(created));
            return { success: true, user: created };
        }
    } catch (e) {
        console.error("Erro no login:", e);
        
        // Fallback para o primeiro acesso/migração
        if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            // Tenta verificar se o usuário existe no Firestore com essa senha (legado)
            const usersRef = collection(db, COLLECTION_USERS);
            const q = query(usersRef, where("email", "==", email), where("password", "==", password));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                console.log("Usuário legado detectado. Migrando para Firebase Auth...");
                const userDoc = querySnapshot.docs[0];
                const userData = { id: userDoc.id, ...userDoc.data() };
                
                // Tenta criar no Firebase Auth para as próximas vezes
                try {
                    await createUserWithEmailAndPassword(auth, email, password);
                    console.log("Migração de Auth concluída com sucesso.");
                } catch (migrationErr) {
                    console.error("Erro na migração de Auth:", migrationErr);
                }

                localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
                return { success: true, user: userData };
            }
        }

        let msg = 'E-mail ou senha incorretos.';
        if (e.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Tente novamente mais tarde.';
        
        return { success: false, message: msg };
    }
}

export async function loginComGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const googleUser = result.user;
        const email = googleUser.email;

        // Verifica se o e-mail está cadastrado no sistema
        const usersRef = collection(db, COLLECTION_USERS);
        const q = query(usersRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userData = { id: userDoc.id, ...userDoc.data() };
            
            // Opcional: Atualiza a foto do usuário se ele não tiver uma
            if (!userData.foto && googleUser.photoURL) {
                await atualizarUsuario(userData.id, { foto: googleUser.photoURL });
                userData.foto = googleUser.photoURL;
            }

            localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
            return { success: true, user: userData };
        } else {
            // Se o e-mail não estiver cadastrado, desloga do Firebase por segurança
            await auth.signOut();
            return { 
                success: false, 
                message: `O e-mail ${email} não está autorizado a acessar este sistema.` 
            };
        }
    } catch (e) {
        console.error("Erro no login com Google:", e);
        let msg = 'Falha na autenticação com o Google.';
        if (e.code === 'auth/popup-blocked') msg = 'O navegador bloqueou o pop-up de login. Por favor, autorize pop-ups.';
        if (e.code === 'auth/operation-not-allowed') msg = 'O login com Google ainda não foi ativado no Firebase Console.';
        if (e.code === 'auth/unauthorized-domain') msg = 'Este domínio não está autorizado no Firebase Console.';
        
        return { success: false, message: msg + (e.message ? ` (${e.code})` : '') };
    }
}

export function getCurrentUser() {
    const saved = localStorage.getItem(AUTH_KEY);
    return saved ? JSON.parse(saved) : null;
}

export async function setCurrentUser(userId) {
    const user = await buscarUsuarioPorId(userId);
    if (user) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        window.location.reload();
    }
}

export async function cadastrarUsuario(userData) {
    try {
        // 1. Cria o usuário no Firebase Auth nativo (para segurança)
        if (userData.email && userData.password) {
            try {
                await createUserWithEmailAndPassword(auth, userData.email, userData.password);
                console.log("Usuário criado no Firebase Auth.");
            } catch (authErr) {
                // Se já existir no Auth, apenas ignoramos o erro e continuamos para o Firestore
                if (authErr.code !== 'auth/email-already-in-use') {
                    console.error("Erro ao criar no Auth:", authErr);
                }
            }
        }

        // 2. Gera username e campos padrão se necessário
        if (!userData.username) {
            userData.username = userData.name.split(' ')[0].toLowerCase() + Math.floor(Math.random() * 100);
        }
        userData.avatar = userData.avatar || 'person';
        if (!userData.password) userData.password = '123456'; // Padrão mínimo 6 chars

        const id = userData.id;
        const dataToSave = { ...userData };
        delete dataToSave.id;

        const usersRef = collection(db, COLLECTION_USERS);
        
        // Se já tiver um ID (edição), usa ele. 
        // Se for NOVO, cria um ID amigável baseado no e-mail ou nome.
        if (id && id.length > 5) {
            await setDoc(doc(db, COLLECTION_USERS, id), dataToSave);
            return { id, ...dataToSave };
        } else {
            // CRIANDO ID AMIGÁVEL: Prioriza e-mail, se não tiver, usa o nome formatado
            const customId = userData.email ? userData.email.toLowerCase() : userData.name.replace(/\s+/g, '-').toLowerCase();
            
            console.log("Criando usuário com ID Amigável:", customId);
            await setDoc(doc(db, COLLECTION_USERS, customId), dataToSave);
            return { id: customId, ...dataToSave };
        }
    } catch (e) {
        console.error("Erro ao cadastrar usuário:", e);
        throw e;
    }
}

export async function buscarUsuarioPorId(id) {
    try {
        const docSnap = await getDoc(doc(db, COLLECTION_USERS, id));
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
    } catch (e) {
        console.error("Erro ao buscar usuário:", e);
    }
    return null;
}

export async function atualizarUsuario(id, userData) {
    try {
        const docRef = doc(db, COLLECTION_USERS, id);
        // Limpar campos undefined
        Object.keys(userData).forEach(key => userData[key] === undefined && delete userData[key]);
        
        const dataToSave = { ...userData };
        delete dataToSave.id;
        
        await updateDoc(docRef, dataToSave);
        
        // Se for o usuário logado, atualiza o storage da sessão
        const currentUser = getCurrentUser();
        if (currentUser && currentUser.id === id) {
            const updated = { ...currentUser, ...userData };
            localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
        }
        
        return { id, ...userData };
    } catch (e) {
        console.error("Erro ao atualizar usuário:", e);
        return null;
    }
}

export async function excluirUsuario(id) {
    try {
        await deleteDoc(doc(db, COLLECTION_USERS, id));
        return true;
    } catch (e) {
        console.error("Erro ao excluir usuário:", e);
        return false;
    }
}

export async function initAuth() {
    console.log("Inicializando autenticação...");
    return new Promise((resolve) => {
        // Apenas garante que o estado inicial foi verificado
        const user = getCurrentUser();
        if (user) console.log("Sessão ativa para:", user.name);
        resolve(user);
    });
}
