import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore} from 'firebase/firestore';
import { getDatabase} from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCQovCWflEUYOK6X_1dzpEwkVMegtWmVcE",
  authDomain: "traffics-38554.firebaseapp.com",
  databaseURL: "https://traffics-38554-default-rtdb.firebaseio.com",
  projectId: "traffics-38554",
  storageBucket: "traffics-38554.firebasestorage.app",
  messagingSenderId: "85150838960",
  appId: "1:85150838960:web:acbb16b4d4420ded8ecb75",
  measurementId: "G-T5D1BEJ74R"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const database = getDatabase(app);


export { app, auth, db ,database};

export interface NotificationDocument {
  id: string;
  name: string;
  hasPersonalInfo: boolean;
  hasCardInfo: boolean;
  currentPage: string;
  time: string;
  notificationCount: number;
  personalInfo?: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
  };
  cardInfo?: {
    cardNumber: string;
    expirationDate: string;
    cvv: string;
  };
}

