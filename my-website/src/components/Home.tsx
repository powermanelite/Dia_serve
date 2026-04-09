import './Home.css';

const LINKEDIN_URL = 'https://www.linkedin.com/in/diamondphu/';
const RESUME_URL = '/resume.pdf';

const experiences = [
  {
    role: 'Software Engineer',
    company: 'Company Name',
    period: '2023 – Present',
    description: 'Built and maintained scalable full-stack applications serving thousands of users. Led feature development and collaborated closely with product and design teams.',
  },
  {
    role: 'Software Engineer Intern',
    company: 'Company Name',
    period: '2022 – 2023',
    description: 'Developed RESTful APIs and improved front-end performance. Contributed to CI/CD pipelines and participated in code reviews.',
  },
];

const skills = [
  'TypeScript', 'React', 'Node.js', 'Python', 'PostgreSQL',
  'AWS', 'Docker', 'GraphQL', 'REST APIs', 'Git',
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
            Passionate software engineer based in San Francisco, CA. I specialize in
            building clean, performant, and user-friendly web applications. I enjoy
            solving complex problems and turning ideas into impactful products.
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
            <a href={RESUME_URL} download className="btn btn--outline">
              <DownloadIcon />
              Download Resume
            </a>
          </div>
        </div>
        <div className="hero-avatar">
          <div className="avatar-ring">
            <div className="avatar-initials">DP</div>
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

      {/* ── Skills ── */}
      <section className="section section--alt">
        <div className="section-inner">
          <h2 className="section-title">Skills</h2>
          <div className="skills-grid">
            {skills.map((skill) => (
              <span key={skill} className="skill-badge">{skill}</span>
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
