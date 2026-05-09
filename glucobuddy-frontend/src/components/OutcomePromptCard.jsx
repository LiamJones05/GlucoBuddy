import { useState, useEffect, useCallback } from 'react';
import { Droplets } from 'lucide-react';
import {
  getPendingOutcome,
  submitOutcome,
} from '../api/services/adaptiveService';

const GLUCOSE_MIN = 2.0;
const GLUCOSE_MAX = 25.0;

export default function OutcomePromptCard({ onOutcomeSubmitted }) {
  const [pending, setPending] = useState(null);   // dose object or null
  const [glucose, setGlucose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(null);
  const [inputError, setInputError] = useState(null);

  const check = useCallback(async () => {
    try {
      const { hasPending, dose } = await getPendingOutcome();
      if (hasPending) {
        setPending(dose);
      }
    } catch {
      // Silently fail — outcome prompt is non-critical
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (!pending || dismissed || submitted) return null;

  const handleGlucoseChange = (e) => {
    setGlucose(e.target.value);
    setInputError(null);
  };

  const validate = () => {
    const val = parseFloat(glucose);
    if (!glucose || isNaN(val)) {
      setInputError('Please enter your current glucose reading.');
      return false;
    }
    if (val < GLUCOSE_MIN || val > GLUCOSE_MAX) {
      setInputError(`Please enter a value between ${GLUCOSE_MIN} and ${GLUCOSE_MAX} mmol/L.`);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitOutcome(pending.id, parseFloat(glucose));
      setSubmitted(true);
      onOutcomeSubmitted?.();
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const doseTime = new Date(pending.calculatedAt);
  const timeString = doseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="outcome-card" role="region" aria-label="Post-meal glucose check">
      <div className="outcome-card__header">
        <div className="outcome-card__icon" aria-hidden>
          <Droplets size={22} strokeWidth={2.2} />
        </div>
        <div className="outcome-card__titles">
          <h4 className="outcome-card__title">How's your glucose?</h4>
          <p className="outcome-card__subtitle">
            You took <strong>{pending.recommendedDose}u</strong> at {timeString} for{' '}
            <strong>{pending.carbsInput}g carbs</strong>. A reading now helps GlucoBuddy
            learn your response.
          </p>
        </div>
        <button
          className="outcome-card__dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <div className="outcome-card__input-row">
        <div className="outcome-card__input-group">
          <input
            type="number"
            className={`outcome-card__input ${inputError ? 'outcome-card__input--error' : ''}`}
            placeholder="e.g. 7.2"
            min={GLUCOSE_MIN}
            max={GLUCOSE_MAX}
            step="0.1"
            value={glucose}
            onChange={handleGlucoseChange}
            aria-label="Current glucose reading in mmol/L"
            disabled={submitting}
          />
          <span className="outcome-card__unit">mmol/L</span>
        </div>

        <button
          className="outcome-card__submit"
          onClick={handleSubmit}
          disabled={submitting || !glucose}
        >
          {submitting ? 'Saving…' : 'Submit'}
        </button>
      </div>

      {inputError && (
        <p className="outcome-card__error">{inputError}</p>
      )}
      {error && (
        <p className="outcome-card__error">{error}</p>
      )}

      <p className="outcome-card__footnote">
        This reading is optional and only used to improve future dose recommendations.
        Your doctor's guidance always takes priority.
      </p>
    </div>
  );
}
