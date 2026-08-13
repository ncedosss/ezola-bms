// LES BMS seed - data straight from the Discovery Walkthrough (2026-07-10)
// Run once: npm run db:seed   (idempotent - skips if users already exist)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function main() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) { console.log('Already seeded - skipping.'); return; }

  const hash = (s) => bcrypt.hashSync(s, 12);

  // ---------- Users (change passwords/PINs before go-live!) ----------
  const users = [
    ['Owner', 'owner@lesengineering.co.za', 'owner', 'Owner@2026', '1111'],
    ['Office Manager', 'office@lesengineering.co.za', 'office_manager', 'Office@2026', '2222'],
    ['Facility Manager', 'facility@lesengineering.co.za', 'facility_manager', 'Facility@2026', '3333'],
    ['Reception', 'reception@lesengineering.co.za', 'reception', 'Reception@2026', '4444'],
    ['Waiter 1', 'waiter1@lesengineering.co.za', 'waiter', 'Waiter1@2026', '5555'],
    ['Waiter 2', 'waiter2@lesengineering.co.za', 'waiter', 'Waiter2@2026', '5556'],
    ['Shop Attendant', 'shop@lesengineering.co.za', 'shop_attendant', 'Shop@2026', '6666'],
    ['Kitchen', 'kitchen@lesengineering.co.za', 'kitchen', 'Kitchen@2026', '7777'],
  ];
  for (const [name, email, role, pw, pin] of users) {
    await pool.query(
      'INSERT INTO users (name,email,role,password_hash,pin_hash) VALUES ($1,$2,$3,$4,$5)',
      [name, email, role, hash(pw), hash(pin)]
    );
  }

  // ---------- Rooms: 4 downstairs @ R130, 6 upstairs @ R150, overnight R550 ----------
  for (let i = 1; i <= 4; i++)
    await pool.query(`INSERT INTO rooms (room_number,floor,hourly_rate,overnight_rate) VALUES ($1,'downstairs',130,550)`, [`D${i}`]);
  for (let i = 1; i <= 6; i++)
    await pool.query(`INSERT INTO rooms (room_number,floor,hourly_rate,overnight_rate) VALUES ($1,'upstairs',150,550)`, [`U${i}`]);
  // TV/fridge per-room flags pending (Open Item) - set via SQL/admin once confirmed.

  // ---------- Kitchen stock register ----------
  const stock = async (register, name, category, unit, qty, thr, yieldPerUnit = null) => {
    const r = await pool.query(
      `INSERT INTO stock_items (register,name,category,unit,current_quantity,low_stock_threshold,plate_yield)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [register, name, category, unit, qty, thr, yieldPerUnit]
    );
    return r.rows[0].id;
  };

  const veg = await stock('kitchen', 'Vegetables (carrots, cabbage, spinach, potatoes)', 'produce', 'kg', 0, 1);
  const lamb = await stock('kitchen', 'Lamb (whole, butchered into 10-plate packs)', 'meat', 'whole_animal', 0, 2, 10);
  const chicken = await stock('kitchen', 'Chicken (whole free-range)', 'meat', 'whole_animal', 0, 10, 5);
  const tripe = await stock('kitchen', 'Tripe (Ulusu)', 'meat', 'kg', 0, null);
  const pap = await stock('kitchen', 'Maize meal (Pap)', 'starch', 'kg', 0, null);
  const rice = await stock('kitchen', 'Rice', 'starch', 'kg', 0, null);
  const samp = await stock('kitchen', 'Samp', 'starch', 'kg', 0, null);
  await stock('kitchen', 'Gas cylinders', 'fuel', 'cylinder', 0, 1);
  const pork = await stock('kitchen', 'Pork (braai)', 'meat', 'kg', 0, null);
  const beef = await stock('kitchen', 'Beef (braai)', 'meat', 'kg', 0, null);
  const wings = await stock('kitchen', 'Chicken wings (braai)', 'meat', 'kg', 0, null);
  const wors = await stock('kitchen', 'Boerewors / Sausage (braai)', 'meat', 'kg', 0, null);

  // ---------- Shop (tuck shop) register - thresholds pending (Open Item) ----------
  const shopItems = {
    household: ['Dishwashing liquid','Bleach','Dux cleaner','Toilet paper','Steel wool','Scourers','Dettol soap','Aquafresh toothpaste','Roll-on deodorant'],
    groceries: ['Rice (retail)','Maize meal (retail)','Cooking oil','Chicken/meat spice','Rajah curry powder - Yellow','Rajah curry powder - Brown','Beef & onion soup (packet)','Chicken soup (packet)','Beef stock cubes','Aromat','Samp (retail)','Beans','Salt'],
    snacks: ['Nik Naks','Flyers','Chippa','Spookies','Simba chips'],
    soft_drinks: ['Water still 1.5L','Water still 500ml','Cappy','Grapetiser','Appletiser','Liqui-Fruit','Coca-Cola 2L','Fanta 2L','Stoney 2L','Sprite 2L'],
    energy_drinks: ['Red Bull','Monster','Switch','Score','Reboost','Dragon','Energade','Powerade'],
    alcohol: ['Corona','Heineken','Black Label','Savanna','Brutal Fruit'],
  };
  const shopStockIds = {};
  for (const [cat, items] of Object.entries(shopItems))
    for (const n of items) shopStockIds[n] = await stock('shop', n, cat, 'unit', 0, null);

  // ---------- Guest house register ----------
  await stock('guest_house', 'Toilet paper (rooms)', 'consumable', 'unit', 0, null);
  await stock('guest_house', 'Towels', 'linen', 'unit', 0, null);
  await stock('guest_house', 'Sheets', 'linen', 'unit', 0, null);
  const condom = await stock('guest_house', 'Condom', 'consumable', 'unit', 0, 10);  // sold at check-in
  await pool.query(`UPDATE stock_items SET sell_price = 10 WHERE id = $1`, [condom]);

  // ---------- Menu ----------
  const menu = async (name, category, pricing, { sit = null, take = null, kg = null, unit = null, avail = true, register = null } = {}) => {
    const r = await pool.query(
      `INSERT INTO menu_items (name,category,pricing_type,price_sit_down,price_takeaway,price_per_kg,price_unit,is_available,stock_register)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [name, category, pricing, sit, take, kg, unit, avail, register]
    );
    return r.rows[0].id;
  };

  // Standard plate: 1 starch + 1 protein + 3 veg, R65 sit-down / R70 takeaway
  const plate = await menu('Standard Plate', 'plate', 'dual_fixed', { sit: 65, take: 70, register: 'kitchen' });
  const gStarch = (await pool.query(`INSERT INTO menu_option_groups (menu_item_id,name) VALUES ($1,'Starch') RETURNING id`, [plate])).rows[0].id;
  const gProtein = (await pool.query(`INSERT INTO menu_option_groups (menu_item_id,name) VALUES ($1,'Protein') RETURNING id`, [plate])).rows[0].id;
  const opt = async (gid, name) =>
    (await pool.query(`INSERT INTO menu_options (group_id,name) VALUES ($1,$2) RETURNING id`, [gid, name])).rows[0].id;
  const oPap = await opt(gStarch, 'Pap'), oRice = await opt(gStarch, 'Rice'), oSamp = await opt(gStarch, 'Samp');
  const oLamb = await opt(gProtein, 'Lamb'), oChick = await opt(gProtein, 'Chicken'), oUlusu = await opt(gProtein, 'Ulusu (Tripe)');

  const ulusuAlone = await menu('Ulusu (Tripe) - standalone', 'protein_standalone', 'unit', { unit: 20, register: 'kitchen' });

  // Tshisa Nyama - seeded UNAVAILABLE until renovation completes (Open Item)
  const braaiPork = await menu('Tshisa Nyama - Pork (per kg)', 'braai_per_kg', 'per_kg', { kg: 110, avail: false, register: 'kitchen' });
  const braaiBeef = await menu('Tshisa Nyama - Beef (per kg)', 'braai_per_kg', 'per_kg', { kg: 160, avail: false, register: 'kitchen' });
  const braaiWings = await menu('Tshisa Nyama - Chicken Wings (per kg)', 'braai_per_kg', 'per_kg', { kg: 140, avail: false, register: 'kitchen' });
  const braaiWors = await menu('Tshisa Nyama - Boerewors (per kg)', 'braai_per_kg', 'per_kg', { kg: 100, avail: false, register: 'kitchen' });

  // Add-ons
  await menu('Hookah - house pipe', 'addon', 'unit', { unit: 200 });
  await menu('Hookah - own pipe', 'addon', 'unit', { unit: 80 });
  await menu('BYO alcohol - carry pack (corkage)', 'addon', 'unit', { unit: 20 });
  await menu('BYO alcohol - cooler box (corkage)', 'addon', 'unit', { unit: 80 });

  // Tuck shop sale items -> linked to shop stock 1:1.
  // !! PLACEHOLDER PRICES - manager to confirm; edit on the Menu/Stock screen or in SQL. !!
  const shopMenu = {
    'Water still 500ml': ['drink', 10], 'Water still 1.5L': ['drink', 18], 'Coca-Cola 2L': ['drink', 30],
    'Fanta 2L': ['drink', 30], 'Stoney 2L': ['drink', 30], 'Sprite 2L': ['drink', 30],
    'Cappy': ['drink', 18], 'Grapetiser': ['drink', 22], 'Appletiser': ['drink', 22], 'Liqui-Fruit': ['drink', 18],
    'Red Bull': ['drink', 25], 'Monster': ['drink', 25], 'Switch': ['drink', 15], 'Score': ['drink', 12],
    'Reboost': ['drink', 12], 'Dragon': ['drink', 15], 'Energade': ['drink', 15], 'Powerade': ['drink', 18],
    'Nik Naks': ['snack', 8], 'Flyers': ['snack', 8], 'Chippa': ['snack', 5], 'Spookies': ['snack', 5], 'Simba chips': ['snack', 15],
    'Dishwashing liquid': ['household', 30], 'Bleach': ['household', 25], 'Dux cleaner': ['household', 20],
    'Toilet paper': ['household', 12], 'Steel wool': ['household', 8], 'Scourers': ['household', 10],
    'Dettol soap': ['household', 15], 'Aquafresh toothpaste': ['household', 18], 'Roll-on deodorant': ['household', 25],
    // Alcohol seeded UNAVAILABLE pending liquor licence clarification (Open Item)
    'Corona': ['alcohol', 30, false], 'Heineken': ['alcohol', 28, false], 'Black Label': ['alcohol', 25, false],
    'Savanna': ['alcohol', 28, false], 'Brutal Fruit': ['alcohol', 28, false],
  };
  for (const [name, [cat, price, avail = true]] of Object.entries(shopMenu)) {
    const mid = await menu(name, cat, 'unit', { unit: price, avail, register: 'shop' });
    if (shopStockIds[name])
      await pool.query(
        `INSERT INTO recipe_consumption (menu_item_id,stock_item_id,quantity_per_unit) VALUES ($1,$2,1)`,
        [mid, shopStockIds[name]]
      );
  }

  // ---------- Recipes (manager's own yield rules -> expected consumption) ----------
  const recipe = (menuId, stockId, qty, optionId = null) =>
    pool.query(
      `INSERT INTO recipe_consumption (menu_item_id,menu_option_id,stock_item_id,quantity_per_unit) VALUES ($1,$2,$3,$4)`,
      [menuId, optionId, stockId, qty]
    );
  await recipe(plate, veg, 0.15);                 // one service spoon of each veg ~ 0.15kg total (tune in operation)
  await recipe(plate, lamb, 0.1, oLamb);          // sheep pack serves 10 plates
  await recipe(plate, chicken, 0.2, oChick);      // whole chicken serves 5 plates
  await recipe(plate, tripe, 0.25, oUlusu);
  await recipe(plate, pap, 0.2, oPap);
  await recipe(plate, rice, 0.2, oRice);
  await recipe(plate, samp, 0.2, oSamp);
  await recipe(ulusuAlone, tripe, 0.15);
  await recipe(braaiPork, pork, 1);               // per kg
  await recipe(braaiBeef, beef, 1);
  await recipe(braaiWings, wings, 1);
  await recipe(braaiWors, wors, 1);

  console.log('Seed complete.');
  console.log('Logins (email / password / till PIN):');
  users.forEach(([n, e, r, p, pin]) => console.log(`  ${r.padEnd(16)} ${e} / ${p} / PIN ${pin}`));
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
