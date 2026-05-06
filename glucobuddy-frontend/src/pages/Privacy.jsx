// Privacy.jsx

import '../styles/Legal.css';

export default function Privacy() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">
          Last updated: 1 May 2026
        </p>

        <section>
          <h2>1. Introduction</h2>
          <p>
            GlucoBuddy is committed to protecting your privacy and
            handling your personal data responsibly.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <p>We may collect the following information:</p>

          <ul>
            <li>Name and email address</li>
            <li>Account login credentials</li>
            <li>Blood glucose readings</li>
            <li>Insulin dosage records</li>
            <li>Meal and carbohydrate data</li>
            <li>User settings and preferences</li>
          </ul>
        </section>

        <section>
          <h2>3. How Your Data Is Used</h2>
          <p>Your information is used to:</p>

          <ul>
            <li>Provide diabetes tracking functionality</li>
            <li>Display analytics and trends</li>
            <li>Store user preferences</li>
            <li>Improve platform reliability and security</li>
          </ul>
        </section>

        <section>
          <h2>4. Data Storage</h2>
          <p>
            Data is stored securely within GlucoBuddy systems and is
            only accessible to authorised services required for
            application functionality.
          </p>
        </section>

        <section>
          <h2>5. Medical Disclaimer</h2>
          <p>
            GlucoBuddy is not a medical device and does not provide
            medical advice, diagnosis, or treatment.
          </p>

          <p>
            Users should always consult qualified healthcare
            professionals before making medical decisions.
          </p>
        </section>

        <section>
          <h2>6. Data Export and Deletion</h2>
          <p>
            Users may export or delete their data at any time using
            the account settings functionality.
          </p>
        </section>

        <section>
          <h2>7. Contact</h2>
          <p>
            For questions regarding this Privacy Policy, please
            contact the GlucoBuddy support team.
          </p>
        </section>
      </div>
    </div>
  );
}