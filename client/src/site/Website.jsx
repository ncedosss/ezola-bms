import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  business, fullAddress, directionsUrl, mapEmbedUrl,
  rooms, plate, chill, shisaNyama, shop, events, images,
} from './siteContent.js';
import './site.css';

const rand = (n) => `R${n}`;

/* The roofline from the LES sign: a red inner roof inside a navy outer roof, with a gold gable. */
function RoofMark({ className = '', title }) {
  return (
    <svg className={className} viewBox="0 0 64 44" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
      aria-label={title}>
      <path d="M4 40 L32 6 L60 40" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="miter" />
      <path d="M17 31 L32 13 L47 31" fill="none" stroke="var(--s-red)" strokeWidth="4" />
      <path d="M24 33 L32 23 L40 33 Z" fill="var(--s-gold)" />
    </svg>
  );
}

/* Image that quietly falls back to a coloured panel if an online photo can't load. */
function Photo({ img, className = '', loading = 'lazy' }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`s-photo-fallback ${className}`} role="img" aria-label={img.alt} />;
  return <img className={className} src={img.src} alt={img.alt} loading={loading} onError={() => setFailed(true)} />;
}

function Header() {
  const [open, setOpen] = useState(false);
  const links = [['#stay', 'Stay'], ['#eat', 'Eat'], ['#shop', 'Shop'], ['#events', 'Events'], ['#visit', 'Visit']];
  return (
    <header className="s-header">
      <div className="s-wrap s-header-inner">
        <a href="#top" className="s-brand" aria-label={`${business.name}, back to top`}>
          <RoofMark className="s-brand-mark" />
          <span>{business.name}</span>
        </a>
        <button className="s-menu-btn" aria-expanded={open} aria-controls="s-nav" onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Menu'}
        </button>
        <nav id="s-nav" className={`s-nav ${open ? 'is-open' : ''}`} aria-label="Main">
          {links.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>
          ))}
          <a className="s-btn s-btn-gold s-nav-cta" href={directionsUrl} target="_blank" rel="noreferrer">Get directions</a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="s-hero" id="top">
      <div className="s-wrap s-hero-grid">
        <div className="s-hero-copy">
          <h1>Stay, eat and celebrate on Mbiko Street</h1>
          <p className="s-lead">
            {business.name} is a guest house, restaurant, tuck shop and events space in {business.address.area}, {business.address.city}.
            Book a room by the hour or the night, sit down to a plate of pap and lamb, or bring the family for a birthday.
          </p>
          <div className="s-actions">
            <a className="s-btn s-btn-gold" href={directionsUrl} target="_blank" rel="noreferrer">Get directions</a>
            <a className="s-btn s-btn-line" href="#stay">See room prices</a>
          </div>
          <p className="s-hero-address">{fullAddress}</p>
        </div>
        <figure className="s-house">
          <svg className="s-house-roof" viewBox="0 0 400 140" aria-hidden="true" preserveAspectRatio="none">
            <path className="s-roof-outer" d="M6 136 L200 8 L394 136" />
            <path className="s-roof-inner" d="M70 136 L200 48 L330 136" />
          </svg>
          <div className="s-house-frame">
            <Photo img={images.building} loading="eager" />
          </div>
          <figcaption>Our front door on Mbiko Street</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Offer() {
  const items = [
    ['#stay', 'Stay', `${rooms.count} rooms, by the hour or overnight`],
    ['#eat', 'Eat', `A full plate from ${rand(plate.sitDown)}`],
    ['#shop', 'Shop', 'Cold drinks, snacks and essentials'],
    ['#events', 'Celebrate', 'Meetings, birthdays and baby showers'],
  ];
  return (
    <nav className="s-offer" aria-label="What we offer">
      <div className="s-wrap s-offer-row">
        {items.map(([href, title, text]) => (
          <a key={href} href={href} className="s-offer-item">
            <strong>{title}</strong>
            <span>{text}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function Stay() {
  return (
    <section className="s-section" id="stay" aria-labelledby="stay-h">
      <div className="s-wrap s-split">
        <div>
          <h2 id="stay-h">Rooms by the hour or the night</h2>
          <p className="s-body">
            We have {rooms.count} clean, private rooms: four downstairs and six upstairs, including two newly renovated rooms.
            Stay for a few hours or for the whole night.
          </p>
          <div className="s-table-wrap">
            <table className="s-rates">
              <caption className="s-sr">Room prices</caption>
              <thead>
                <tr><th scope="col">Room</th><th scope="col">Per hour</th><th scope="col">Overnight, weekday</th><th scope="col">Overnight, weekend</th></tr>
              </thead>
              <tbody>
                {rooms.rates.map((r) => (
                  <tr key={r.room}>
                    <th scope="row">{r.room} <span className="s-count">({r.count})</span></th>
                    <td>{rand(r.hourly)}</td><td>{rand(r.weekday)}</td><td>{rand(r.weekend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="s-notes">
            {rooms.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <p className="s-small">Prices can change. Please confirm at reception.</p>
        </div>
        <Photo img={images.room} className="s-side-photo" />
      </div>
    </section>
  );
}

function Eat() {
  return (
    <section className="s-section s-section-wall" id="eat" aria-labelledby="eat-h">
      <div className="s-wrap s-split s-split-flip">
        <Photo img={images.grill} className="s-side-photo" />
        <div>
          <h2 id="eat-h">A full plate for {rand(plate.sitDown)}</h2>
          <p className="s-body">Home-style cooking from our kitchen. Build your plate from one starch, one protein and three veg.</p>
          <div className="s-plate">
            <div>
              <h3>Starch</h3>
              <ul>{plate.starch.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <h3>Protein</h3>
              <ul>{plate.protein.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <h3>Veg</h3>
              <ul><li>{plate.veg}</li></ul>
            </div>
          </div>
          <dl className="s-prices">
            <div><dt>Sit down</dt><dd>{rand(plate.sitDown)}</dd></div>
            <div><dt>Takeaway</dt><dd>{rand(plate.takeaway)}</dd></div>
            {plate.extras.map((e) => <div key={e.name}><dt>{e.name}</dt><dd>{rand(e.price)}</dd></div>)}
          </dl>
        </div>
      </div>
    </section>
  );
}

function Chill() {
  return (
    <section className="s-section" aria-labelledby="chill-h">
      <div className="s-wrap s-split">
        <div>
          <h2 id="chill-h">Sit down and chill</h2>
          <p className="s-body">
            Our coffee shop is a good spot to catch up with friends. Order a coffee, light a hookah,
            or bring your own drinks for a small corkage fee.
          </p>
          <dl className="s-prices s-prices-list">
            {chill.map((c) => (
              <div key={c.name}><dt>{c.name}{c.note && <span className="s-small"> ({c.note})</span>}</dt><dd>{rand(c.price)}</dd></div>
            ))}
          </dl>
        </div>
        <Photo img={images.coffee} className="s-side-photo s-side-photo-short" />
      </div>
    </section>
  );
}

function ShisaNyama() {
  return (
    <section className="s-braai" aria-labelledby="braai-h">
      <Photo img={images.braai} className="s-braai-bg" />
      <div className="s-wrap s-braai-inner">
        <div className="s-braai-panel">
          <h2 id="braai-h">{shisaNyama.reopened ? 'Tshisa nyama, sold by the kilogram' : 'Our tshisa nyama is getting a makeover'}</h2>
          <p>
            {shisaNyama.reopened
              ? 'Choose your meat and we’ll braai it over the coals while you wait.'
              : 'The braai is closed while we renovate. When it reopens, you’ll choose your meat by the kilogram and we’ll braai it over the coals.'}
          </p>
          <dl className="s-prices s-prices-dark">
            {shisaNyama.perKg.map((m) => <div key={m.name}><dt>{m.name}</dt><dd>{rand(m.price)} per kg</dd></div>)}
          </dl>
          {!shisaNyama.reopened && <p className="s-small s-on-dark">Prices when the braai reopens.</p>}
        </div>
      </div>
    </section>
  );
}

function Shop() {
  return (
    <section className="s-section" id="shop" aria-labelledby="shop-h">
      <div className="s-wrap">
        <h2 id="shop-h">Forgot something? The tuck shop has it</h2>
        <p className="s-body">Our tuck shop is open to guests and neighbours alike. Here’s some of what we stock.</p>
        <div className="s-shop">
          {shop.map((g) => (
            <div key={g.group} className="s-shop-group">
              <h3>{g.group}</h3>
              <p>{g.items.join(', ')}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Events() {
  return (
    <section className="s-section s-section-mist" id="events" aria-labelledby="events-h">
      <div className="s-wrap">
        <div className="s-events-head">
          <h2 id="events-h">Room for meetings, birthdays and baby showers</h2>
          <p className="s-body">
            Book our spaces for your next meeting or celebration. Our kitchen can feed your guests,
            and the tuck shop is right there for drinks.
          </p>
        </div>
        <div className="s-events">
          <ul className="s-event-list">
            {events.map((e) => (
              <li key={e.name}><strong>{e.name}</strong><span>{e.text}</span></li>
            ))}
          </ul>
          <div className="s-event-photos">
            <Photo img={images.boardroom} />
            <Photo img={images.party} />
            <Photo img={images.sign} />
          </div>
        </div>
        <ContactButtons label="Book your event" />
      </div>
    </section>
  );
}

function ContactButtons({ label, showFallback = true }) {
  const wa = business.whatsapp && `https://wa.me/${business.whatsapp}?text=${encodeURIComponent(`Hi ${business.name}, I'd like to ask about a booking.`)}`;
  const any = business.phone || wa || business.email;
  return (
    <div className="s-actions s-contact-actions">
      {wa && <a className="s-btn s-btn-navy" href={wa} target="_blank" rel="noreferrer">{label} on WhatsApp</a>}
      {business.phone && <a className="s-btn s-btn-navy" href={`tel:${business.phone.replace(/\s/g, '')}`}>Call {business.phone}</a>}
      {business.email && <a className="s-btn s-btn-outline" href={`mailto:${business.email}`}>Email us</a>}
      {!any && showFallback && <p className="s-body s-tight">To book, visit reception at {business.address.street}. We’ll help you plan it.</p>}
    </div>
  );
}

function TikTok() {
  const { videoUrl, videoId, handle } = business.tiktok;
  useEffect(() => {
    // TikTok's embed script turns the blockquote below into a video player.
    document.querySelectorAll('script[data-tiktok-embed]').forEach((s) => s.remove());
    const s = document.createElement('script');
    s.src = 'https://www.tiktok.com/embed.js';
    s.async = true;
    s.dataset.tiktokEmbed = 'true';
    document.body.appendChild(s);
    return () => s.remove();
  }, []);
  return (
    <section className="s-section" aria-labelledby="tiktok-h">
      <div className="s-wrap s-tiktok">
        <div className="s-tiktok-copy">
          <h2 id="tiktok-h">See the place for yourself</h2>
          <p className="s-body">Here’s a look at LES Guest House on TikTok. Tag us when you visit.</p>
          <a className="s-text-link" href={videoUrl} target="_blank" rel="noreferrer">Watch on TikTok</a>
        </div>
        <div className="s-tiktok-embed">
          <blockquote className="tiktok-embed" cite={videoUrl} data-video-id={videoId}>
            <section>
              <a href={videoUrl} target="_blank" rel="noreferrer">Watch {handle} on TikTok</a>
            </section>
          </blockquote>
        </div>
      </div>
    </section>
  );
}

function Visit() {
  return (
    <section className="s-section s-visit" id="visit" aria-labelledby="visit-h">
      <div className="s-wrap s-split">
        <div>
          <h2 id="visit-h">Visit us in {business.address.area}</h2>
          <address className="s-address">
            {business.name}<br />
            {business.address.street}<br />
            {business.address.area}, {business.address.city}<br />
            {business.address.postal}
          </address>
          {business.hours.length > 0 && (
            <dl className="s-hours">
              {business.hours.map((h) => <div key={h.days}><dt>{h.days}</dt><dd>{h.time}</dd></div>)}
            </dl>
          )}
          <div className="s-actions">
            <a className="s-btn s-btn-gold" href={directionsUrl} target="_blank" rel="noreferrer">Get directions</a>
          </div>
          <ContactButtons label="Message us" showFallback={false} />
        </div>
        <div className="s-map">
          <iframe title={`Map showing ${business.name}, ${fullAddress}`} src={mapEmbedUrl} loading="lazy"
            referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const credits = Object.values(images).filter((i) => i.credit);
  return (
    <footer className="s-footer">
      <div className="s-wrap s-footer-grid">
        <div>
          <div className="s-brand s-brand-footer"><RoofMark className="s-brand-mark" /><span>{business.name}</span></div>
          <p>{business.tagline}</p>
          <p>{fullAddress}</p>
        </div>
        <div className="s-footer-meta">
          <p>
            Photos by{' '}
            {credits.map((i, n) => (
              <React.Fragment key={i.credit.url}>
                <a href={i.credit.url} target="_blank" rel="noreferrer">{i.credit.name}</a>
                {n < credits.length - 2 ? ', ' : n === credits.length - 2 ? ' and ' : ''}
              </React.Fragment>
            ))}{' '}on Unsplash.
          </p>
          <p>© {new Date().getFullYear()} {business.name}. <Link to="/login">Staff login</Link></p>
        </div>
      </div>
    </footer>
  );
}

export default function Website() {
  useEffect(() => {
    const prev = document.title;
    document.title = `${business.name} | Rooms, food and events in ${business.address.area}, ${business.address.city}`;
    return () => { document.title = prev; };
  }, []);
  return (
    <div className="site">
      <a className="s-skip" href="#stay">Skip to content</a>
      <Header />
      <main>
        <Hero />
        <Offer />
        <Stay />
        <Eat />
        <Chill />
        <ShisaNyama />
        <Shop />
        <Events />
        <TikTok />
        <Visit />
      </main>
      <Footer />
    </div>
  );
}
