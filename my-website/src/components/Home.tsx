import './Home.css';

const LINKEDIN_URL = 'https://www.linkedin.com/in/diamond-phu/';
const GITHUB_URL = 'https://github.com/powermanelite';
const RESUME_URL = '/Diamond_Phu_Resume.pdf';

const experiences = [
  {
    role: 'Software Engineer',
    company: 'Naval Air Systems Command (NAVAIR)',
    period: 'Oct. 2022 – Sept. 2025',
    description: 'Bridged software development, networking, and data systems in real-time defense and aerospace environments. Supported 80+ high-complexity test and evaluation events for aircraft, ship, and missile systems. Built full-stack applications with C#, .NET, and Avalonia UI for telemetry data management and network configuration.',
  },
];

const education = {
  school: 'University of California, Santa Cruz',
  degree: 'B.S. in Computer Science',
  period: 'Sep. 2019 – Jul. 2022',
};

const languages = [
  'Python', 'C#', 'SQL', 'PowerShell', 'C', 'C++', 'Java', 'JavaScript', 'TypeScript',
];

const technologies = [
  '.NET', 'WPF', 'AvaloniaUI', 'React', 'Linux/Unix', 'Git',
  'SQL Server', 'PostgreSQL', 'MySQL', 'Docker', 'Wireshark', 'Pandas', 'NumPy',
];

function Home() {
  return (
    <div className="home">

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-text">
          <p className="hero-greeting">Hi there, I'm</p>
          <h1 className="hero-name">Diamond Phu</h1>
          <p className="hero-title">Software Engineer</p>
          <p className="hero-bio">
            UC Santa Cruz Computer Science graduate with experience bridging software
            development, networking, and data systems in defense and aerospace environments
            at NAVAIR. I build full-stack applications with C#, .NET, React, and SQL,
            and enjoy turning complex problems into clean, reliable solutions.
          </p>
          <div className="hero-actions">
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary"
            >
              <LinkedInIcon />
              LinkedIn Profile
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--outline"
            >
              <GitHubIcon />
              GitHub
            </a>
            <a href={RESUME_URL} download className="btn btn--outline">
              <DownloadIcon />
              Download Resume
            </a>
          </div>
        </div>
      </section>

      {/* ── Experience ── */}
      <section className="section">
        <div className="section-inner">
          <h2 className="section-title">Experience</h2>
          <div className="experience-list">
            {experiences.map((exp, i) => (
              <div key={i} className="exp-card">
                <div className="exp-header">
                  <div>
                    <h3 className="exp-role">{exp.role}</h3>
                    <span className="exp-company">{exp.company}</span>
                  </div>
                  <span className="exp-period">{exp.period}</span>
                </div>
                <p className="exp-desc">{exp.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Education ── */}
      <section className="section section--alt">
        <div className="section-inner">
          <h2 className="section-title">Education</h2>
          <div className="exp-card">
            <h3 className="exp-role">{education.school}</h3>
            <span className="exp-company">{education.degree}</span>
            <span className="exp-period" style={{ marginTop: 8, display: 'inline-block' }}>{education.period}</span>
          </div>
        </div>
      </section>

      {/* ── Skills ── */}
      <section className="section">
        <div className="section-inner">
          <h2 className="section-title">Languages</h2>
          <div className="skills-grid">
            {languages.map((lang) => (
              <span key={lang} className="skill-badge">{lang}</span>
            ))}
          </div>
          <h2 className="section-title" style={{ marginTop: 40 }}>Technologies</h2>
          <div className="skills-grid">
            {technologies.map((tech) => (
              <span key={tech} className="skill-badge">{tech}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact CTA ── */}
      <section className="section">
        <div className="section-inner cta-section">
          <h2 className="cta-title">Let's work together</h2>
          <p className="cta-text">
            Open to new opportunities and collaborations. Feel free to reach out!
          </p>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--primary"
          >
            Get in Touch
          </a>
        </div>
      </section>

    </div>
  );
}

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default Home;
