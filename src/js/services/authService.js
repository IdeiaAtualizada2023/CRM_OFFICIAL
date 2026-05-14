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
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const AUTH_KEY = 'crm_current_user';
const COLLECTION_USERS = 'usuarios';

// Usuários padrão (backup caso o banco esteja vazio)
const INITIAL_USERS = [
    { id: 'admin-001', username: 'admin', name: 'Administrador Principal', role: 'Administrador', cpf: '000.000.000-00', cod: '000', avatar: 'person', email: 'admin@amels.com', password: 'admin' }
];

let cachedUsers = [];

export async function listarUsuarios() {
    try {
        const querySnapshot = await getDocs(collection(db, COLLECTION_USERS));
        const users = [];
        querySnapshot.forEach((doc) => {
            users.push({ id: doc.id, ...doc.data() });
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

export async function login(email, password) {
    try {
        const usersRef = collection(db, COLLECTION_USERS);
        
        // 1. Verifica se existem usuários no banco
        const snapshotTotal = await getDocs(usersRef);
        if (snapshotTotal.empty) {
            console.log("Banco vazio detectado no login. Criando admin padrão...");
            await cadastrarUsuario(INITIAL_USERS[0]);
        }

        // 2. Tenta o login real
        const q = query(usersRef, where("email", "==", email), where("password", "==", password));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const user = { id: userDoc.id, ...userDoc.data() };
            localStorage.setItem(AUTH_KEY, JSON.stringify(user));
            return { success: true, user };
        }
    } catch (e) {
        console.error("Erro no login:", e);
    }
    return { success: false, message: 'E-mail ou senha incorretos.' };
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
        // Gera username baseado no primeiro nome (minúsculo)
        if (!userData.username) {
            userData.username = userData.name.split(' ')[0].toLowerCase() + Math.floor(Math.random() * 100);
        }
        userData.avatar = userData.avatar || 'person';
        if (!userData.password) userData.password = '123';

        const usersRef = collection(db, COLLECTION_USERS);
        
        if (userData.id) {
            const id = userData.id;
            const dataToSave = { ...userData };
            delete dataToSave.id;
            await setDoc(doc(db, COLLECTION_USERS, id), dataToSave);
            return userData;
        } else {
            const docRef = await addDoc(usersRef, userData);
            return { id: docRef.id, ...userData };
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

