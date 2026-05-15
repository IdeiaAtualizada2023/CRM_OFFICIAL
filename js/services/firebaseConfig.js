import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAyR1EP87FI0SvMsEZ_b_zHw-icsa0I3sg",
  authDomain: "meucrmvendas.firebaseapp.com",
  projectId: "meucrmvendas",
  storageBucket: "meucrmvendas.firebasestorage.app",
  messagingSenderId: "1035486597492",
  appId: "1:1035486597492:web:6ec5fd7b2dc2d1149a5c21",
  measurementId: "G-VG0Y5TTBXL"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

console.log("Firebase conectado com sucesso!");
