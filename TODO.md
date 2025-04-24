### ✅ **Daily Developer Checklist**  
📁 **Project**: `unwanted-twitch`  
🧩 **Goal**: Maintain, improve, and test extension that hides unwanted Twitch content

---

### 🕘 **1. Start of Day – Setup**

- [ ] ⏹️ **Close all non-essential files** in VS Code  
- [ ] 📂 **Open VS Code at root** of project: `G:\unwanted-twitch`
- [ ] 🔁 **Pull latest from GitHub**  
  > VS Code ctrl+shift+p `pull` → `Git:Pull`  
  
- [ ] 🧠 **Review notes**
  - Check `Ideas.txt` → Check for notes on any previous tasks exist
  - Review last debugging issue (if needed)
  - If yesterday's task was finished then proceed to next bugfix or feature from `Ideas.txt`

---

### 🛠️ **2. Feature or Bugfix Session**

- [ ] 🔧 **Choose one task**
  > (Example: “Fix blacklist.js import bugs” or “Tweak stream card styles”)

- [ ] ✏️ **Work only on relevant files**  
  *(Use split view in VS Code for fast navigation)*

- [ ] 🚀 **Use Chrome DevTools for live testing**
  1. Open `chrome://extensions`
  2. Enable **Developer Mode**
  3. Click **"Load Unpacked"**
  4. Point to the project root folder
  5. **Test modified Twitch pages**

- [ ] 👀 **Track file changes**
  > Source Control → Review all files listed as changed

---

### 💾 **3. Save & Snapshot**

- [ ] ✅ Stage changes:
  > Source Control tab → Select files → Click `+`

- [ ] 📝 Commit with purpose:
  ```bash
  git commit -m "Fix stream card detection in directory.js"
  ```

- [ ] 🗂️ Optional: Create backup copy in `scripts/original/`  
  > For major changes to `directory.js`, `blacklist.js`, etc.

---

### 📤 **4. Push to GitHub**

- [ ] 🔼 Push commit(s):
  ```bash
  git push origin main
  ```

---

### 🔁 **5. Optional: Extension Packaging**

- [ ] 🔖 Chrome:
  ```bat
  G:\pack_chrome.bat
  ```

- [ ] 🔖 Firefox:
  ```bat
  G:\pack_firefox.bat
  ```

- [ ] 💾 Move `.zip` to `publish/chrome/` or `publish/firefox/`

---

### 🧪 **6. Test Import/Export**

- [ ] Use `tests/*.json` to test `blacklist.js`:
  - Validate large import handling
  - Confirm storage size limits aren't breached

---

### 🧹 **7. End of Day Cleanup**

- [ ] 🗃️ Stage & commit leftover files:
  ```bash
  git add .
  git commit -m "Daily checkpoint: minor fixes and style tweaks"
  ```

- [ ] 🔁 Final `git push`

- [ ] 📝 Log major changes in:
  - `README.md` (if user-facing)
  - `CHANGELOG_v0.01.md` (if versioned)

- [ ] 🔒 Close VS Code to save state