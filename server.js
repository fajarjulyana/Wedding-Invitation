const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

// Initialize SQLite database
const db = new sqlite3.Database('./invitations.db');

// Create table if it doesn't exist
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS invitations (slug TEXT PRIMARY KEY, coupleName TEXT, weddingDate TEXT, weddingTime TEXT, weddingLocation TEXT, rsvpDate TEXT, photos TEXT, design TEXT)");
});

// Setup folder for storing uploaded photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { files: 7 }  // Maximum of 7 files
});

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Route to display the form (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Handle form submission and generate unique invitation link
app.post('/generate', upload.array('preWeddingPhotos', 7), (req, res) => {
  const { coupleName, weddingDate, weddingTime, weddingLocation, rsvpDate, design } = req.body;
  const photos = req.files;

  if (!photos || photos.length === 0) {
    return res.send('<p>Harap unggah setidaknya satu foto.</p>');
  }

  // Create slug from couple name for the URL
  const slug = coupleName.toLowerCase().replace(/\s+/g, '-');

  // Save data into SQLite database
  const photoPaths = photos.map(file => file.filename).join(',');

  const stmt = db.prepare("INSERT OR REPLACE INTO invitations (slug, coupleName, weddingDate, weddingTime, weddingLocation, rsvpDate, photos, design) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  stmt.run(slug, coupleName, weddingDate, weddingTime, weddingLocation, rsvpDate, photoPaths, design, function(err) {
    if (err) {
      return res.status(500).send('<p>Terjadi kesalahan saat menyimpan data.</p>');
    }
    res.redirect(`/invitation/${slug}`);
  });
  stmt.finalize();
});

// Display invitation based on couple's slug
app.get('/invitation/:slug', (req, res) => {
  const slug = req.params.slug;

  db.get("SELECT * FROM invitations WHERE slug = ?", [slug], (err, invitation) => {
    if (err || !invitation) {
      return res.status(404).send('<h1>Undangan Tidak Ditemukan</h1><p>Periksa kembali link atau buat undangan baru.</p>');
    }

    const photoHTML = invitation.photos.split(',').map(file =>
      `<img src="/uploads/${file}" alt="Foto Pre-Wedding" class="photo">`
    ).join('');

    const templateFile = invitation.design === 'minimalis' ? 'design-2.html' : 'design-1.html';

    fs.readFile(path.join(__dirname, 'design', templateFile), 'utf8', (err, template) => {
      if (err) {
        return res.status(500).send('<h1>Gagal memuat desain undangan.</h1>');
      }

      let invitationHTML = template.replace(/{{coupleName}}/g, invitation.coupleName)
        .replace(/{{weddingDate}}/g, invitation.weddingDate)
        .replace(/{{weddingTime}}/g, invitation.weddingTime)
        .replace(/{{weddingLocation}}/g, invitation.weddingLocation)
        .replace(/{{rsvpDate}}/g, invitation.rsvpDate)
        .replace(/{{photoHTML}}/g, photoHTML);

      res.send(invitationHTML);
    });
  });
});

// Admin page to view all invitations
app.get('/admin', (req, res) => {
  let adminContent = `
    <link rel="stylesheet" href="/css/styles.css">
    <div class="admin-container">
      <h1>Panel Admin</h1>
      <ul>
  `;

  db.all("SELECT slug, coupleName, design FROM invitations", (err, rows) => {
    if (err) {
      return res.status(500).send('<p>Terjadi kesalahan saat mengambil data undangan.</p>');
    }

    rows.forEach(row => {
      adminContent += `<li><a href="/invitation/${row.slug}">${row.coupleName}</a> - Desain: ${row.design}</li>`;
    });

    adminContent += `
      </ul>
      <a href="/">Kembali ke Form</a>
    </div>
  `;

    res.send(adminContent);
  });
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});

