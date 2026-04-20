import { useEffect, useState } from 'react';
import API from '../api/api';
import '../styles/settings.css';

export default function Settings() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    API.get('/settings').then(res => setSettings(res.data));
  }, []);

  const update = async () => {
    await API.put('/settings', settings);
    alert('Updated');
  };

  return (
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
    </div>
  );
}