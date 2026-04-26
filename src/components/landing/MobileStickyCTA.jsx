import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoginModal from '../auth/LoginModal';

export default function MobileStickyCTA({ onLoginSuccess }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);

  function handleCTA() {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      setLoginOpen(true);
    }
  }

  return (
    <>
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
          <button
            onClick={handleCTA}
            className="btn-cta w-full justify-center text-sm py-3"
          >
            {isAuthenticated ? 'Open Dashboard' : 'Start Deploying Free'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          setLoginOpen(false);
          onLoginSuccess?.();
        }}
      />
    </>
  );
}
