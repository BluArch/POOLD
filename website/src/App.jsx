import "./App.css";

function App() {
  return (
    <div className="site" id="top">
      <nav className="navbar">
        <div className="brand">POOLD</div>

        <div className="nav-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#journey">Journey</a>
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

            {/* <p className="hero-description">
              POOLD helps communities split bulk purchases so everyone can access
              lower prices without buying or storing more than they need.
            </p> */}
            <p className="hero-description">
              POOLD helps UVic students access bulk savings by splitting large
              purchases with people nearby, taking only the share they need, and
              picking it up on campus.
            </p>

            <div className="hero-buttons">
              <a className="primary-button" href="#how-it-works">
                See How It Works
              </a>

              {/* <a className="secondary-button" href="#preview">
                View App
              </a> */}
              <a className="secondary-button" href="#mvp">
                Try the MVP
              </a>
            </div>
          </div>

          <div className="hero-image">
            <img
              src="/images/Communities_Page3.png"
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

          {/* <div className="steps">
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
                Collect your items at the scheduled community pickup.
              </p>
            </div>
          </div> */}

          <div className="steps">
            <div className="step-card">
              <span>01</span>
              <h3>Join a Group</h3>
              <p>
                Find a UVic group heading to a store like Costco or Walmart.
              </p>
            </div>

            <div className="step-card">
              <span>02</span>
              <h3>Take a Share</h3>
              <p>
                Choose only the amount you need instead of buying the whole bulk pack.
              </p>
            </div>

            <div className="step-card">
              <span>03</span>
              <h3>Pick It Up</h3>
              <p>
                Meet at the scheduled campus pickup and collect the items you claimed.
              </p>
            </div>
          </div>

        </section>

        <section className="section journey-section" id="journey">
          <p className="section-label">BUYER & ORGANIZER JOURNEY</p>
          <h2>One group order. Two connected experiences.</h2>

          <p className="journey-intro">
            POOLD guides the order from the moment an organizer creates it to
            the moment every buyer collects their share.
          </p>

          <div className="journey-labels">
            <div className="journey-role-label buyer-role-label">Buyer</div>
            <div className="journey-role-label organizer-role-label">
              Organizer
            </div>
          </div>

          <div className="journey-timeline">
            <div className="timeline-line"></div>

            <div className="timeline-step organizer-step">
              <div className="timeline-card organizer-timeline-card">
                <div className="timeline-number">01</div>
                <div className="scene-icon">📋</div>
                <h3>Create & publish a group</h3>
                <p>
                  The organizer chooses the store, products, pickup location, and
                  deadline for a shopping trip they were already planning.
                </p>
              </div>
              <div className="timeline-node"></div>
            </div>

            <div className="timeline-step buyer-step">
              <div className="timeline-card buyer-timeline-card">
                <div className="timeline-number">02</div>
                <div className="scene-icon">🛒</div>
                <h3>Choose your shares</h3>
                <p>
                  The buyer joins the group and claims only the quantities they need.
                </p>
              </div>
              <div className="timeline-node"></div>
            </div>

            <div className="timeline-step buyer-step">
              <div className="timeline-card buyer-timeline-card">
                <div className="timeline-number">03</div>
                <div className="scene-icon">💳</div>
                <h3>Commit payment</h3>
                <p>
                  The buyer adds their payment method and commits to the shares they
                  selected.
                </p>
              </div>
              <div className="timeline-node"></div>
            </div>

            <div className="timeline-step organizer-step">
              <div className="timeline-card organizer-timeline-card">
                <div className="timeline-number">04</div>
                <div className="scene-icon">💰</div>
                <h3>Receive shopping funds</h3>
                <p>
                  Before shopping begins, the organizer receives the money needed for
                  the group's purchases instead of paying out of pocket.
                </p>
              </div>
              <div className="timeline-node"></div>
            </div>

            <div className="timeline-step organizer-step">
              <div className="timeline-card organizer-timeline-card">
                <div className="timeline-number">05</div>
                <div className="scene-icon moving-car">🚗</div>
                <h3>Shop for the group</h3>
                <p>
                  The organizer uses the consolidated order to buy the group's items
                  during their planned shopping trip.
                </p>
              </div>
              <div className="timeline-node"></div>
            </div>

            <div className="timeline-step buyer-step">
              <div className="timeline-card buyer-timeline-card">
                <div className="timeline-number">06</div>
                <div className="scene-icon">📍</div>
                <h3>Head to campus pickup</h3>
                <p>
                  The buyer goes to the scheduled UVic pickup location during the
                  agreed pickup window.
                </p>
              </div>
              <div className="timeline-node"></div>
            </div>

            <div className="timeline-step buyer-step">
              <div className="timeline-card buyer-timeline-card">
                <div className="timeline-number">07</div>
                <div className="scene-icon">🛍️</div>
                <h3>Collect your share</h3>
                <p>
                  The buyer takes the exact items and quantities they claimed.
                </p>
              </div>
              <div className="timeline-node"></div>
            </div>

            <div className="timeline-step organizer-step">
              <div className="timeline-card organizer-timeline-card">
                <div className="timeline-number">08</div>
                <div className="scene-icon pop-check">✓</div>
                <h3>Confirm the handoff</h3>
                <p>
                  The organizer verifies that the buyer received their share and
                  completes the pickup.
                </p>
              </div>
              <div className="timeline-node"></div>
            </div>
          </div>


          
        </section>

        {/* <section className="section features-section" id="features">
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
                Organizers can keep track of orders, quantities, shopping, and
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
        </section> */}

        <section className="section payment-section">
          <p className="section-label">BUILT FOR TRUST</p>
          <h2>Safer for buyers. Less risk for organizers.</h2>

          <div className="payment-grid">
            <div className="payment-card">
              <span>01</span>
              <h3>UVic-only accounts</h3>
              <p>
                Every POOLD account requires a valid UVic email, helping keep
                transactions inside a known campus community.
              </p>
            </div>

            <div className="payment-card">
              <span>02</span>
              <h3>Buyers commit first</h3>
              <p>
                Buyers choose their shares and provide payment before the organizer
                begins the shopping run.
              </p>
            </div>

            <div className="payment-card">
              <span>03</span>
              <h3>Organizer gets funded</h3>
              <p>
                Shopping funds are provided before the trip so the organizer does
                not have to cover the group's purchase with their own money.
              </p>
            </div>
          </div>
        </section>

        <section className="section features-section" id="features">
          <p className="section-label">WHY POOLD?</p>
          <h2>Bulk savings, built around student life.</h2>

          <div className="feature-grid">
            <div className="feature-card">
              <h3>UVic-Verified Accounts</h3>
              <p>
                Accounts can only be created using a valid UVic email, helping keep
                group buying within the university community.
              </p>
            </div>

            <div className="feature-card">
              <h3>Take Only What You Need</h3>
              <p>
                Access bulk pricing without buying, storing, or using an entire
                bulk package yourself.
              </p>
            </div>

            <div className="feature-card">
              <h3>Pre-Funded Organizers</h3>
              <p>
                Organizers receive the shopping funds before the trip, so they do
                not have to personally front the cost of the group purchase.
              </p>
            </div>

            <div className="feature-card">
              <h3>Trips Already Happening</h3>
              <p>
                Organizers create groups around shopping trips they were already
                planning to make.
              </p>
            </div>

            <div className="feature-card">
              <h3>Campus Pickup</h3>
              <p>
                Buyers know the pickup location and time before joining and collect
                their shares at a familiar campus location.
              </p>
            </div>

            <div className="feature-card">
              <h3>Everything in One Place</h3>
              <p>
                Shares, payments, shopping, pickup details, and handoff are managed
                through one workflow instead of group chats and manual tracking.
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
                src="/images/Communities_Page3.png"
                alt="POOLD communities page"
              />
              <p>Discover community orders</p>
            </div>

            <div className="screenshot-card">
              <img
                src="/images/Group_Creation3.png"
                alt="POOLD group creation screen"
              />
              <p>Create a group order</p>
            </div>

            <div className="screenshot-card">
              <img
                src="/images/Review_orders3.png"
                alt="POOLD review orders screen"
              />
              <p>Review individual orders</p>
            </div>

            <div className="screenshot-card">
              <img
                src="/images/Pickup_Orders3.png"
                alt="POOLD pickup screen"
              />
              <p>Coordinate pickup</p>
            </div>
          </div>
        </section>

        <section className="section mvp-section" id="mvp">
          <div className="mvp-content">
            <p className="section-label">TRY POOLD</p>

            <h2>Ready to try the MVP?</h2>

            {/* <p>
              Experience the POOLD group-buying flow and see how communities can
              purchase in bulk together.
            </p> */}
            <p>
              Explore the complete buying and organizing flow using our live UVic
              demo.
            </p>

            <a
              className="mvp-download-button"
              href="https://poold.onrender.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Try the MVP
              <span>↗</span>
            </a>

            <p className="mvp-note">
              Currently available as a prototype for testing.
            </p>
          </div>

          <div className="mvp-phone">
            <img
              src="/images/Community_Example3.png"
              alt="POOLD mobile app"
            />
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