import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettings, updateSettings } from '../api/services/settingsService';
import { exportData, previewImport, importData } from '../api/services/dataService';
import '../styles/settings.css';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [pendingImportData, setPendingImportData] = useState(null);
  

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
  getSettings()
    .then(res => setSettings(res.data))
    .catch(() => alert('Failed to load settings'));
  }, []);

  const update = async () => {
    try {
      await updateSettings(settings);
      alert('Settings updated');
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
    }
  };

  // ---------------- DELETE ----------------
  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');

    try {
      await API.delete('/auth/account', {
        data: { password },
      });

      localStorage.removeItem('token');
      navigate('/login');

    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  // ---------------- DOWNLOAD ----------------
  const handleDownload = async () => {
    try {
      const response = await exportData();

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');

      link.href = url;
      link.setAttribute('download', `glucobuddy-data-${new Date().toISOString().slice(0,10)}.json`);

      document.body.appendChild(link);
      link.click();
      link.remove();

    } catch (err) {
      alert('Failed to download data');
    }
  };

  // ---------------- UPLOAD ----------------
  const handleUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setFileName(file.name);

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Call preview endpoint
    const res = await previewImport(data);

    setImportPreview(res.data);
    setPendingImportData(data);

  } catch (err) {
    console.error(err);
    alert(err.response?.data?.error || 'Invalid file or preview failed');
  }
};

const confirmImport = async () => {
  try {
    await importData(pendingImportData);

    alert('Data restored successfully');
    window.location.reload();

  } catch (err) {
    alert(err.response?.data?.error || 'Import failed');
  }
};


  return (
    <>
      <div className="settings">
        <h2 className="settings-title">Settings</h2>

        {/* ---------------- SETTINGS ---------------- */}
        <div className="settings-card">
          <h3>Correction & Targets</h3>

          <label>Correction Ratio</label>
          <input
            value={settings.correction_ratio || ''}
            onChange={e =>
              setSettings({ ...settings, correction_ratio: e.target.value })
            }
          />

          <label>Target Min</label>
          <input
            value={settings.target_min || ''}
            onChange={e =>
              setSettings({ ...settings, target_min: e.target.value })
            }
          />

          <label>Target Max</label>
          <input
            value={settings.target_max || ''}
            onChange={e =>
              setSettings({ ...settings, target_max: e.target.value })
            }
          />
        </div>

        <div className="settings-card">
          <h3>Time-based Carb Ratios</h3>

          <label>Morning</label>
          <input
            value={settings.carb_ratio_morning || ''}
            onChange={e =>
              setSettings({
                ...settings,
                carb_ratio_morning: Number(e.target.value),
              })
            }
          />

          <label>Afternoon</label>
          <input
            value={settings.carb_ratio_afternoon || ''}
            onChange={e =>
              setSettings({
                ...settings,
                carb_ratio_afternoon: Number(e.target.value),
              })
            }
          />

          <label>Evening</label>
          <input
            value={settings.carb_ratio_evening || ''}
            onChange={e =>
              setSettings({
                ...settings,
                carb_ratio_evening: Number(e.target.value),
              })
            }
          />
        </div>

        <button onClick={update}>Save</button>

        {/* ---------------- BACKUP & RESTORE ---------------- */}
        <div className="export-card">
          <h3>Backup & Restore</h3>
          <p>Download or restore your full data history.</p>

          <button onClick={handleDownload} className="download-btn">
            Download my data
          </button>
            
          <div
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onClick={() => document.getElementById('fileUpload').click()}

            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true); 
            }}

            onDragLeave={() => setDragActive(false)} 

            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false); 

              const file = e.dataTransfer.files[0];
              if (file) {
                setFileName(file.name); 
                handleUpload({ target: { files: [file] } });
              }
            }}
          >
            <p className="upload-title">Upload backup file</p>
            <p className="upload-subtext">Drag & drop your JSON file here or click to browse</p>
            {fileName && (
              <p className="upload-file">
                Uploaded: {fileName}
              </p>
            )}
          </div>

          <input
            id="fileUpload"
            type="file"
            accept="application/json"
            onChange={handleUpload}
            style={{ display: 'none' }}
          />

            {importPreview && (
              <div className="import-preview">
                <h4>Import Preview</h4>

                <p><strong>Glucose logs:</strong> {importPreview.counts.glucose}</p>
                <p><strong>Insulin logs:</strong> {importPreview.counts.insulin}</p>
                <p><strong>Meals:</strong> {importPreview.counts.meals}</p>
                <p><strong>Dose calculations:</strong> {importPreview.counts.doses}</p>

                <p>
                  <strong>Date range:</strong><br />
                  {importPreview.dateRange.start} → {importPreview.dateRange.end}
                </p>

                <button onClick={confirmImport} className="delete-btn">
                  Confirm Import
                </button>
              </div>
            )}

        </div>

        {/* ---------------- DANGER ZONE ---------------- */}
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

      {/* ---------------- MODAL ---------------- */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Delete Account</h2>

            <p>This action cannot be undone.</p>

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
            </div>
          </div>
        </div>
      )}
    </>
  );
}