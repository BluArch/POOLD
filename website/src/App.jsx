import "./App.css";

function App() {
  return (
    <div className="site">
      <nav className="navbar">
        <div className="brand">POOLD</div>

        <div className="nav-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Features</a>
          <a href="#preview">Preview</a>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-text">
            <p className="eyebrow">COMMUNITY BULK BUYING</p>

            <h1>
              Buy together.
              <br />
              Save together.
            </h1>

            <p className="hero-description">
              POOLD helps communities split bulk purchases so everyone can access
              lower prices without buying or storing more than they need.
            </p>

            <div className="hero-buttons">
              <a className="primary-button" href="#how-it-works">
                See How It Works
              </a>

              <a className="secondary-button" href="#preview">
                View App
              </a>
            </div>
          </div>

          <div className="hero-image">
            <img
              src="/images/Communities_Page.png"
              alt="POOLD community orders screen"
            />
          </div>
        </section>

        <section className="section intro">
          <p className="section-label">WHAT IS POOLD?</p>

          <h2>Bulk prices without the bulk commitment.</h2>

          <p>
            Buying in bulk can lower the price per item, but large quantities,
            storage limitations, and coordinating with other people can make it
            inconvenient. POOLD organizes the process by helping communities
            create shared orders, claim individual quantities, and coordinate
            pickup.
          </p>
        </section>

        <section className="section" id="how-it-works">
          <p className="section-label">HOW IT WORKS</p>
          <h2>A group purchase, without the group-chat chaos.</h2>

          <div className="steps">
            <div className="step-card">
              <span>01</span>
              <h3>Join an Order</h3>
              <p>
                Find a recurring community order or join a one-time group buy.
              </p>
            </div>

            <div className="step-card">
              <span>02</span>
              <h3>Claim Your Share</h3>
              <p>
                Choose how much of each bulk product you actually want.
              </p>
            </div>

            <div className="step-card">
              <span>03</span>
              <h3>See Your Total</h3>
              <p>
                POOLD calculates your share so costs stay clear and organized.
              </p>
            </div>

            <div className="step-card">
              <span>04</span>
              <h3>Pick It Up</h3>
              <p>
                Collect your packed order at the scheduled community pickup.
              </p>
            </div>
          </div>
        </section>

        <section className="section features-section" id="features">
          <p className="section-label">WHY POOLD?</p>
          <h2>Built for community purchasing.</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>Recurring Community Orders</h3>
              <p>
                Weekly or monthly buying cycles make group purchasing predictable
                instead of starting from scratch every time.
              </p>
            </div>

            <div className="feature-card">
              <h3>Verified Communities</h3>
              <p>
                Community-based accounts help create a more trusted environment
                for group purchases and pickup.
              </p>
            </div>

            <div className="feature-card">
              <h3>Organizer Dashboard</h3>
              <p>
                Organizers can keep track of orders, quantities, packing, and
                pickup from one place.
              </p>
            </div>

            <div className="feature-card">
              <h3>Shared Quantities</h3>
              <p>
                Members take only the portion they need instead of purchasing an
                entire bulk package themselves.
              </p>
            </div>

            <div className="feature-card">
              <h3>Pickup Coordination</h3>
              <p>
                Scheduled pickup details and order summaries help make handoff
                simple and organized.
              </p>
            </div>

            <div className="feature-card">
              <h3>Community Demand</h3>
              <p>
                Members can request what they want to bulk-buy next so future
                orders reflect actual demand.
              </p>
            </div>
          </div>
        </section>

        <section className="section preview-section" id="preview">
          <p className="section-label">APP PREVIEW</p>
          <h2>From group creation to pickup.</h2>

          <div className="screenshots">
            <div className="screenshot-card">
              <img
                src="/images/Communities_Page.png"
                alt="POOLD communities page"
              />
              <p>Discover community orders</p>
            </div>

            <div className="screenshot-card">
              <img
                src="/images/Group_Creation.png"
                alt="POOLD group creation screen"
              />
              <p>Create a group order</p>
            </div>

            <div className="screenshot-card">
              <img
                src="/images/Review_orders.png"
                alt="POOLD review orders screen"
              />
              <p>Review individual orders</p>
            </div>

            <div className="screenshot-card">
              <img
                src="/images/Pickup_Orders.png"
                alt="POOLD pickup screen"
              />
              <p>Coordinate pickup</p>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div>
            <p className="section-label">POOLD</p>
            <h2>Better buying power, together.</h2>
          </div>

          <a className="primary-button" href="#top">
            Back to Top
          </a>
        </section>
      </main>

      <footer>
        <strong>POOLD</strong>
        <span>Community bulk buying made simple.</span>
      </footer>
    </div>
  );
}

export default App;