import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettings, updateSettings } from '../api/services/settingsService';
import { exportData, previewImport, importData } from '../api/services/dataService';
import { deleteAccount } from '../api/services/authService';
import '../styles/settings.css';
import '../styles/adaptive.css';
import AdaptiveSettings from '../components/AdaptiveSettings';

export default function Settings() {
  const [settings, setSettings]               = useState({});
  const [dragActive, setDragActive]           = useState(false);
  const [fileName, setFileName]               = useState('');
  const [importPreview, setImportPreview]     = useState(null);
  const [pendingImportData, setPendingImportData] = useState(null);

  // Inline feedback
  const [settingsError,   setSettingsError]   = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [downloadError,   setDownloadError]   = useState('');
  const [uploadError,     setUploadError]     = useState('');
  const [importError,     setImportError]     = useState('');
  const [importSuccess,   setImportSuccess]   = useState('');

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword]               = useState('');
  const [deleteError, setDeleteError]         = useState('');
  const [deleting, setDeleting]               = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    getSettings()
      .then(res => setSettings(res.data))
      .catch(() => setSettingsError('Failed to load settings. Please refresh the page.'));
  }, []);

  // ---------------- SAVE SETTINGS ----------------
  const update = async () => {
    setSettingsError('');
    setSettingsSuccess('');
    try {
      await updateSettings(settings);
      setSettingsSuccess('Settings saved successfully.');
    } catch (err) {
      setSettingsError(err.response?.data?.error || 'Failed to save settings.');
    }
  };

  // ---------------- DELETE ACCOUNT ----------------
  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount({ password });
      localStorage.removeItem('token');
      navigate('/');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  };

  // ---------------- DOWNLOAD ----------------
  const handleDownload = async () => {
    setDownloadError('');
    try {
      const response = await exportData();
      const url  = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `glucobuddy-data-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setDownloadError('Failed to download data. Please try again.');
    }
  };

  // ---------------- UPLOAD / PREVIEW ----------------
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setUploadError('');
    setImportPreview(null);
    setPendingImportData(null);
    setImportError('');
    setImportSuccess('');

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res  = await previewImport(data);
      setImportPreview(res.data);
      setPendingImportData(data);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Invalid file or preview failed. Please check the file and try again.');
    }
  };

  // ---------------- CONFIRM IMPORT ----------------
  const confirmImport = async () => {
    setImportError('');
    setImportSuccess('');
    try {
      await importData(pendingImportData);
      setImportSuccess('Data restored successfully. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setImportError(err.response?.data?.error || 'Import failed. Your existing data has not been changed.');
    }
  };

  return (
    <>
      <div className="settings">
        <h2 className="settings-title">Settings</h2>

        {settingsError && <p className="form-error">{settingsError}</p>}

        {/* ---------------- CORRECTION & TARGETS ---------------- */}
        <div className="settings-card">
          <h3>Correction &amp; Targets</h3>

          <label>Correction Ratio</label>
          <input
            value={settings.correction_ratio || ''}
            onChange={e => setSettings({ ...settings, correction_ratio: e.target.value })}
          />

          <label>Target Min</label>
          <input
            value={settings.target_min || ''}
            onChange={e => setSettings({ ...settings, target_min: e.target.value })}
          />

          <label>Target Max</label>
          <input
            value={settings.target_max || ''}
            onChange={e => setSettings({ ...settings, target_max: e.target.value })}
          />
        </div>

        {/* ---------------- CARB RATIOS ---------------- */}
        <div className="settings-card">
          <h3>Time-based Carb Ratios</h3>

          <label>Morning</label>
          <input
            value={settings.carb_ratio_morning || ''}
            onChange={e => setSettings({ ...settings, carb_ratio_morning: Number(e.target.value) })}
          />

          <label>Afternoon</label>
          <input
            value={settings.carb_ratio_afternoon || ''}
            onChange={e => setSettings({ ...settings, carb_ratio_afternoon: Number(e.target.value) })}
          />

          <label>Evening</label>
          <input
            value={settings.carb_ratio_evening || ''}
            onChange={e => setSettings({ ...settings, carb_ratio_evening: Number(e.target.value) })}
          />
        </div>

        <button onClick={update}>Save</button>

        {settingsSuccess && <p className="form-success">{settingsSuccess}</p>}

        <AdaptiveSettings />

        {/* ---------------- BACKUP & RESTORE ---------------- */}
        <div className="export-card">
          <h3>Backup &amp; Restore</h3>
          <p>Download or restore your full data history.</p>

          <button onClick={handleDownload} className="download-btn">
            Download my data
          </button>

          {downloadError && <p className="form-error">{downloadError}</p>}

          <div
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onClick={() => document.getElementById('fileUpload').click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
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
            <p className="upload-subtext">Drag &amp; drop your JSON file here or click to browse</p>
            {fileName && <p className="upload-file">Selected: {fileName}</p>}
          </div>

          <input
            id="fileUpload"
            type="file"
            accept="application/json"
            onChange={handleUpload}
            style={{ display: 'none' }}
          />

          {uploadError && <p className="form-error">{uploadError}</p>}

          {importPreview && (
            <div className="import-preview">
              <h4>Import Preview</h4>
              <p className="form-error" style={{ marginBottom: '0.75rem' }}>
                ⚠️ Importing will permanently replace your existing data. This cannot be undone.
              </p>
              <p><strong>Glucose logs:</strong> {importPreview.counts.glucose}</p>
              <p><strong>Insulin logs:</strong> {importPreview.counts.insulin}</p>
              <p><strong>Meals:</strong> {importPreview.counts.meals}</p>
              <p><strong>Dose calculations:</strong> {importPreview.counts.doses}</p>
              <p>
                <strong>Date range:</strong><br />
                {importPreview.dateRange.start} → {importPreview.dateRange.end}
              </p>

              {importError   && <p className="form-error">{importError}</p>}
              {importSuccess && <p className="form-success">{importSuccess}</p>}

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
            onClick={() => { setPassword(''); setDeleteError(''); setShowDeleteModal(true); }}
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* ---------------- DELETE MODAL ---------------- */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Delete Account</h2>
            <p>This action cannot be undone. All your data will be permanently deleted.</p>

            <input
              type="password"
              placeholder="Enter your password to confirm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {deleteError && <p className="form-error">{deleteError}</p>}

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