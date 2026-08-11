import { useState, useEffect } from 'react';
import { LockClosedIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import authService from '../../services/authService';

/**
 * Change the signed-in user's password.
 *
 * Only reachable for accounts that signed in with email and password — Google
 * and wallet sessions have no password, and the sidebar entry is hidden for them.
 */
export default function ChangePasswordModal({ isOpen, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPass(false);
      setError('');
      setDone(false);
    }
  }, [isOpen]);

  // Close on its own once the user has read the confirmation.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(onClose, 2000);
    return () => clearTimeout(id);
  }, [done, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await authService.changePassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const revealToggle = (
    <button
      type="button"
      onClick={() => setShowPass(v => !v)}
      className="absolute right-3 bottom-3 text-text-muted hover:text-text transition-colors"
      tabIndex={-1}
    >
      {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      {done ? (
        <div className="flex flex-col items-center gap-4 text-center py-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircleIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">Password changed</h2>
            <p className="text-sm text-text-secondary mt-1">
              Your new password is active right away. You stay signed in on this device.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="mb-1">
            <h2 className="text-2xl font-semibold text-text mb-2">Change password</h2>
            <p className="text-sm text-text-secondary/70">
              Confirm your current password, then choose a new one.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <div className="relative">
            <Input
              label="Current password"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              leftIcon={LockClosedIcon}
              placeholder="Enter your current password"
              required
            />
            {revealToggle}
          </div>

          <Input
            label="New password"
            type={showPass ? 'text' : 'password'}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            leftIcon={LockClosedIcon}
            placeholder="Create a strong password"
            hint="Minimum 8 characters"
            required
            minLength={8}
          />

          <Input
            label="Confirm new password"
            type={showPass ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leftIcon={LockClosedIcon}
            placeholder="Repeat the new password"
            required
            minLength={8}
          />

          <div className="flex gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={onClose} className="!h-12">
              Cancel
            </Button>
            <Button type="submit" fullWidth loading={loading} className="!h-12">
              Change password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
