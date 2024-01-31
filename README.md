# sss-backup 🛡️

<div align="center">
<img src="https://github.com/rharkor/sss-backup/blob/main/logo.png?raw=true" alt="sss-backup logo" width="200"/>
</div>

## 🚀 Getting Started

Welcome to `sss-backup`, your go-to tool for automated file backup to an S3 bucket! 📦

👉 **Note:** This tool is optimized for Unix systems and hasn't been tested on Windows.

### 🔐 Encryption with GPG

Keep your backups secure with GPG encryption. Here's how to set it up:

1. **Generate a Key Pair:**

   ```bash
   gpg --full-generate-key
   ```

2. **List Your Keys:**

   ```bash
   gpg --list-secret-keys --keyid-format LONG
   ```

   Look for the line starting with `sec` to find your KeyID.

3. **Export Your Public Key:**

   ```bash
   gpg --armor --export <key-id>
   ```

   You can save this to a file or share it directly.

4. **Import Someone Else's Public Key (not required in backup process):**
   ```bash
   gpg --import /path/to/recipientkey.asc
   ```
   Optionally, fully trust the imported key if you're confident in its authenticity:
   ```bash
   gpg --edit-key <RecipientKeyID>
   ```
   In GPG console, type `trust`, select trust level, and then `quit`.

### 🏃 Running sss-backup

1. **Set Up:**

   ```bash
   wget -q https://raw.githubusercontent.com/rharkor/sss-backup/main/docker-compose.yml -O docker-compose.yml && wget -q https://raw.githubusercontent.com/rharkor/sss-backup/main/.env.example -O .env && wget -q https://raw.githubusercontent.com/rharkor/sss-backup/main/bkp-config.json -O bkp-config.json
   ```

   Modify `.env` and `bkp-config.json` as needed.

2. **Run the Container:**

   🔄 With Cron:

   ```bash
   docker compose pull
   docker compose up -d
   ```

   🚀 One Time:

   ```bash
   docker pull rg.fr-par.scw.cloud/sss-backup/sss-backup:latest
   docker run --rm -v $(pwd)/bkp-config.json:/usr/src/app/bkp-config.json:ro -v $(pwd)/.env:/usr/src/app/.env:ro -v /:/backup:ro -v $(pwd)/.tmp:/usr/src/app/.tmp:rw -it -e HOST_ROOT='/backup' --env-file .env rg.fr-par.scw.cloud/sss-backup/sss-backup:latest
   ```

### 📦 Use a backup

1. First download the backup from your S3 bucket.
2. **Decrypt**
   ```bash
   gpg --output backup.tar.gz --decrypt backup.tar.gz.gpg
   ```
3. **Extract**
   ```bash
    tar -xvzf backup.tar.gz
   ```

## 💻 Development

👨‍💻 To Contribute:

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Run Locally:**

   ```bash
   npm run index.ts
   ```

3. **Build and Push Docker Image:**
   ```bash
   docker build -t rg.fr-par.scw.cloud/sss-backup/sss-backup:latest .
   docker push rg.fr-par.scw.cloud/sss-backup/sss-backup:latest
   ```

---

Happy backing up with `sss-backup`! 💾 🎉

## Known issues

```bash
      throw er; // Unhandled 'error' event
      ^

Error: write EPIPE
at **node_internal_captureLargerStackTrace (node:internal/errors:563:5)
at **node_internal_errnoException (node:internal/errors:690:12)
at WriteWrap.onWriteComplete [as oncomplete] (node:internal/stream_base_commons:94:16)
Emitted 'error' event on TLSSocket instance at:
at emitErrorNT (node:internal/streams/destroy:169:8)
at emitErrorCloseNT (node:internal/streams/destroy:128:3)
at process.processTicksAndRejections (node:internal/process/task_queues:82:21) {
errno: -32,
code: 'EPIPE',
syscall: 'write'
}

Node.js v20.11.0
```

_No solution found yet_
