# HSU Peradeniya – A/L Digital Resource Centre

A free resource website for A/L students, run by the Hindu Student Union, University of Peradeniya.

Students open the site and browse without logging in. Committee admins sign in at `/admin.html` to manage everything.

**Frontend:** plain HTML, CSS and JavaScript (no build step), hosted free on GitHub Pages.
**Backend:** Supabase (database, admin login, file storage) on the free plan.

## What it does

Public site (`index.html`): subjects list, nested sections (Physics → Unit 3 → Past papers…), resource lists with filters by type and medium, search, in-page YouTube player, PDF open and download, recently added list. Works on phones and supports dark mode.

Admin panel (`admin.html`): sign in, then create, rename, move, reorder and delete subjects and subcategories at any depth. Add resources as PDF uploads (several at once), other files, Google Drive links, YouTube videos or website links. Edit, move to another category, hide/show, reorder or delete any resource. Deleting a category also deletes everything inside it, including uploaded files.

## Folder layout

```
index.html          public website
admin.html          admin panel
css/style.css       all styles
js/config.js        ← put your Supabase URL and key here
js/common.js        shared helpers
js/app.js           public site logic
js/admin.js         admin logic
supabase/schema.sql database tables, security rules and storage bucket
supabase/update-1-site-settings.sql  only for databases set up before the site settings feature
assets/             HSU and university logos, favicon, mandala.svg (background pattern)
```

## Setup (about 15 minutes)

### 1. Create the Supabase project
1. Go to supabase.com, sign up, and create a new project (free plan; choose the Singapore or Mumbai region for Sri Lanka).
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and click **Run**.

### 2. Create your admin account
1. Go to **Authentication → Users → Add user → Create new user**. Enter your email and a strong password and tick **Auto confirm user**.
2. Back in the **SQL Editor**, run this with your own email:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
3. In the Authentication settings, turn **off** "Allow new users to sign up", so only people you add can create accounts.

To add more committee admins later, repeat steps 1 and 2 for each person. To remove one, delete their row from the `admins` table.

### 3. Connect the website
In Supabase go to **Project Settings → API** (or **API Keys**), copy the **Project URL** and the **anon / publishable key**, and paste them into `js/config.js`.

The anon key is meant to be public. The rules in `schema.sql` (Row Level Security) mean visitors can only read, and only accounts in the `admins` table can change data or upload files. Never put the `service_role` / secret key in this project.

### 4. Put it on GitHub Pages
1. Create a new public repository on GitHub, for example `hsu-resources`.
2. Upload all the files (keep the folders), or push with git:
   ```bash
   git init
   git add .
   git commit -m "HSU resource centre"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/hsu-resources.git
   git push -u origin main
   ```
3. In the repository go to **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/hsu-resources/`. The admin panel is at `.../admin.html`.

You can later connect a custom domain in the same Pages settings.

### 5. Add your first content
Sign in at `admin.html`, click **New subject** and add Physics, Chemistry, Biology, Combined Maths and so on (you can add an emoji icon like ⚛️ 🧪 🧬). Open a subject, add subcategories such as "Past papers", "Model papers", "Unit 1 – Measurement", "Seminar recordings", then add resources inside them.

## Good to know

- **Free plan limits:** 1 GB of file storage and 50 MB per file. Put large files (big scanned paper bundles) in Google Drive and add them as Drive links. Remember to set Drive sharing to "Anyone with the link".
- **Pausing:** Supabase may pause free projects that have no activity for a while. If that happens, open the Supabase dashboard and click Restore.
- **Hidden resources:** untick "Show on the public site" to prepare something before releasing it.
- **Changing text and the home picture:** in the admin panel, open **Site text and picture** (bottom of the left sidebar). You can change the home page title and text, the picture beside the title, the About page, the contact email, the name in the top bar and the footer note. Colours are at the top of `css/style.css`. The Tamil union name (home page), the verse and the committee line (footer, `index.html`) are fixed text: edit them in the files.

## Updating from an earlier version

If you set up the database before the "Site text and picture" feature was added, run `supabase/update-1-site-settings.sql` once in the Supabase SQL Editor. New installs don't need it, because `schema.sql` already includes it.
