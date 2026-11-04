import { createRoot } from 'react-dom/client';
import { Loader2 } from 'lucide-react';
import App from './App.tsx';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import './index.css';

function AuthGate() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
      </div>
    );
  }
  return status === 'authenticated' ? <App /> : <LoginPage />;
}

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <AuthGate />
  </AuthProvider>
);
