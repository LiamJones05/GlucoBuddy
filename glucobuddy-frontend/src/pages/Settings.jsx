import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/api';
import '../styles/settings.css';

export default function Settings() {
  const [settings, setSettings] = useState({});

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    API.get('/settings').then(res => setSettings(res.data));
  }, []);

  const update = async () => {
    await API.put('/settings', settings);
    alert('Updated');
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');

    try {
      const token = localStorage.getItem('token');

      await API.delete('/auth/account', {
        data: { password },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Clear session
      localStorage.removeItem('token');

      // Redirect to login
      navigate('/login');

    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async () => {
      try {
        const response = await API.get('/auth/export', {
          responseType: 'blob',
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');

        link.href = url;
        link.setAttribute('download', 'glucobuddy-data.json');

        document.body.appendChild(link);
        link.click();
        link.remove();

      } catch (err) {
        alert('Failed to download data');
      }
    };

  return (
    <>
      <div className="settings">
        <h2 className="settings-title">Settings</h2>

        {/* Correction & Targets */}
        <div className="settings-card">
          <h3>Correction & Targets</h3>

          <label htmlFor="correction_ratio">Correction Ratio</label>
          <input
            id="correction_ratio"
            placeholder="e.g. 2"
            value={settings.correction_ratio || ''}
            onChange={e =>
              setSettings({
                ...settings,
                correction_ratio: e.target.value
              })
            }
          />

          <label htmlFor="target_min">Target Min</label>
          <input
            id="target_min"
            placeholder="e.g. 4.0"
            value={settings.target_min || ''}
            onChange={e =>
              setSettings({
                ...settings,
                target_min: e.target.value
              })
            }
          />

          <label htmlFor="target_max">Target Max</label>
          <input
            id="target_max"
            placeholder="e.g. 8.0"
            value={settings.target_max || ''}
            onChange={e =>
              setSettings({
                ...settings,
                target_max: e.target.value
              })
            }
          />
        </div>

        {/* Carb Ratios */}
        <div className="settings-card">
          <h3>Time-based Carb Ratios</h3>

          <label htmlFor="carb_ratio_morning">Morning Carb Ratio</label>
          <input
            id="carb_ratio_morning"
            placeholder="e.g. 10"
            value={settings.carb_ratio_morning || ''}
            onChange={e =>
              setSettings({
                ...settings,
                carb_ratio_morning: Number(e.target.value)
              })
            }
          />

          <label htmlFor="carb_ratio_afternoon">Afternoon Carb Ratio</label>
          <input
            id="carb_ratio_afternoon"
            placeholder="e.g. 12"
            value={settings.carb_ratio_afternoon || ''}
            onChange={e =>
              setSettings({
                ...settings,
                carb_ratio_afternoon: Number(e.target.value)
              })
            }
          />

          <label htmlFor="carb_ratio_evening">Evening Carb Ratio</label>
          <input
            id="carb_ratio_evening"
            placeholder="e.g. 14"
            value={settings.carb_ratio_evening || ''}
            onChange={e =>
              setSettings({
                ...settings,
                carb_ratio_evening: Number(e.target.value)
              })
            }
          />
        </div>

        <button onClick={update}>Save</button>

        {/* Danger Zone */}
        <div className="settings-card danger-zone">
          <h3>Danger Zone</h3>
          <p className="danger-text">
            Permanently delete your account and all stored data.
          </p>

          <button
            className="delete-btn"
            onClick={() => {
              setPassword('');
              setDeleteError('');
              setShowDeleteModal(true);
            }}
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Delete Account</h2>

            <p>
              This action cannot be undone. All your glucose, insulin,
              and report data will be permanently deleted.
            </p>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {deleteError && <p className="error">{deleteError}</p>}

            <div className="modal-actions">
              <button onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>

              <button
                className="delete-btn"
                onClick={handleDeleteAccount}
                disabled={!password || deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="download-btn"
              >
                Download my data
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}