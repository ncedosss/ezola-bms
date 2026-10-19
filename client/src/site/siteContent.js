// ============================================================================
// LES Guest House public website — all the words, prices and contact details.
// Edit this file to update the website. You don't need to touch Website.jsx.
//
// Prices below come from the BMS seed data (db/seed.js). If the owner changes a
// price in the system, change it here too so the website matches.
// ============================================================================

export const business = {
  name: 'LES Guest House',
  tagline: 'Guest house & events facility',
  address: {
    street: '137 Mbiko St',
    area: 'Strand',
    city: 'Cape Town',
    postal: '7139',
  },

  // Fill these in and the website shows Call / WhatsApp / Email buttons automatically.
  // Leave as '' to hide them.
  phone: '',      // e.g. '021 000 0000'
  whatsapp: '',   // international format, digits only, e.g. '27820000000'
  email: '',      // e.g. 'bookings@lesguesthouse.co.za'

  // Opening hours. Only Friday & Saturday are confirmed so far (open until midnight).
  // Add the other days when the owner confirms them, e.g. { days: 'Monday – Thursday', time: '08:00 – 22:00' }.
  hours: [
    { days: 'Friday and Saturday', time: 'Open until midnight' },
  ],

  tiktok: {
    videoUrl: 'https://www.tiktok.com/@mr_gagx/video/7461258658115112197',
    videoId: '7461258658115112197',
    handle: '@mr_gagx',
  },
};

export const fullAddress = `${business.address.street}, ${business.address.area}, ${business.address.city}, ${business.address.postal}`;
const mapsQuery = encodeURIComponent(`${business.name}, ${fullAddress}`);
export const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
export const mapEmbedUrl = `https://maps.google.com/maps?q=${mapsQuery}&z=16&output=embed`;

// ---------- Guest house (10 rooms: 4 downstairs, 6 upstairs incl. 2 renovated) ----------
export const rooms = {
  count: 10,
  rates: [
    { room: 'Downstairs rooms', count: 4, hourly: 130, weekday: 550, weekend: 550 },
    { room: 'Upstairs rooms', count: 4, hourly: 150, weekday: 420, weekend: 550 },
    { room: 'Upstairs, renovated', count: 2, hourly: 150, weekday: 520, weekend: 650 },
  ],
  notes: [
    'Weekend overnight stays (Friday, Saturday and Sunday nights) include two plates of food from our kitchen.',
    'Overnight stays start from 18:00 and check-out is at 11:00 the next morning.',
    'Short stays are paid upfront for 1 to 5 hours, and you can add more time at reception.',
    'Pay at reception by cash or card. Keys are handed over once you’ve paid.',
  ],
};

// ---------- Restaurant ----------
export const plate = {
  sitDown: 65,
  takeaway: 70,
  starch: ['Pap', 'Rice', 'Samp'],
  protein: ['Lamb', 'Chicken', 'Ulusu (tripe)'],
  veg: 'Three servings of vegetables',
  extras: [{ name: 'Ulusu on its own', price: 20 }],
};

// Coffee shop / sit down and chill extras (from the BMS menu)
export const chill = [
  { name: 'Hookah with our pipe', price: 200 },
  { name: 'Hookah with your own pipe', price: 80 },
  { name: 'Bring your own drinks: carry pack', price: 20, note: 'corkage' },
  { name: 'Bring your own drinks: cooler box', price: 80, note: 'corkage' },
];

// Tshisa nyama is closed for renovation. Set reopened: true when it's back.
export const shisaNyama = {
  reopened: false,
  perKg: [
    { name: 'Beef', price: 160 },
    { name: 'Chicken wings', price: 140 },
    { name: 'Pork', price: 110 },
    { name: 'Boerewors', price: 100 },
  ],
};

// ---------- Tuck shop (no prices shown: shop prices are still being confirmed) ----------
export const shop = [
  { group: 'Cold drinks', items: ['Coca-Cola', 'Fanta', 'Stoney', 'Sprite', 'Appletiser', 'Grapetiser', 'Liqui-Fruit', 'Water'] },
  { group: 'Energy drinks', items: ['Red Bull', 'Monster', 'Switch', 'Score', 'Reboost', 'Dragon', 'Powerade', 'Energade'] },
  { group: 'Snacks', items: ['Simba', 'Nik Naks', 'Flyers', 'Chippa', 'Spookies'] },
  { group: 'Household and toiletries', items: ['Toilet paper', 'Dishwashing liquid', 'Bleach', 'Dettol soap', 'Toothpaste', 'Roll-on'] },
];

// ---------- Events (from the sign at the entrance) ----------
export const events = [
  { name: 'Meeting room', text: 'For team meetings, interviews and workshops.' },
  { name: 'Boardroom', text: 'A quiet table for planning sessions and board meetings.' },
  { name: 'Braai spot', text: 'Fire up the braai with friends and family.' },
  { name: 'Birthday parties', text: 'From a first birthday to a fiftieth.' },
  { name: 'Baby showers', text: 'A relaxed space to celebrate the new arrival.' },
  { name: 'Sit down and chill', text: 'Grab a coffee, take a seat and catch up.' },
];

// ---------- Images ----------
// Your own photos live in client/public/site/. Online photos are free-licence Unsplash images
// (https://unsplash.com/license); credits are shown in the footer. To use your own photos instead,
// put them in client/public/site/ and change the src to '/site/your-photo.jpg'.
const unsplash = (id, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

export const images = {
  building: { src: '/site/building.jpg', alt: 'LES Guest House on Mbiko Street, with its double-storey timber front and red roof' },
  sign: { src: '/site/sign.jpg', alt: 'The LES Guest House & Events Facility sign at the entrance' },
  room: { src: unsplash('photo-1631049421450-348ccd7f8949'), alt: 'A made-up double bed with white linen and bedside lamps',
    credit: { name: 'Point3D Commercial Imaging Ltd.', url: 'https://unsplash.com/photos/_Swg04CP0bU' } },
  grill: { src: unsplash('photo-1529262123100-898cb9e0d85b'), alt: 'Meat grilling over hot coals',
    credit: { name: 'Jo Jo', url: 'https://unsplash.com/photos/wI__5oGrpf4' } },
  braai: { src: unsplash('photo-1512719724284-dbb9ef47eac5'), alt: 'Flames rising from a braai in Strand, Cape Town',
    credit: { name: 'Jaco Pretorius', url: 'https://unsplash.com/photos/Ry6vwtAJu4g' } },
  coffee: { src: unsplash('photo-1462917882517-e150004895fa', 900), alt: 'A latte being poured into a white cup',
    credit: { name: 'Taylor Franz', url: 'https://unsplash.com/photos/GJogrGZxKJE' } },
  boardroom: { src: unsplash('photo-1431540015161-0bf868a2d407'), alt: 'A boardroom table with chairs around it',
    credit: { name: 'Benjamin Child', url: 'https://unsplash.com/photos/GWe0dlVD9e0' } },
  party: { src: unsplash('photo-1530103862676-de8c9debad1d', 900), alt: 'Colourful party balloons',
    credit: { name: 'Adi Goldstein', url: 'https://unsplash.com/photos/Hli3R6LKibo' } },
};