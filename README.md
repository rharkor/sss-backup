# sss-backup

## Getting Started

A backup tool to automatically backup files to a S3 bucket.

_Please note that this tool was developed for unix systems and has not been tested on Windows._

### Encryption

Backups are encrypted using [GPG](https://gnupg.org/). You can generate a key pair using the following command:

```bash
gpg --full-generate-key
```

After generating your key pair, list your keys:

```bash
gpg --list-secret-keys --keyid-format LONG
```

You'll see output like:

```markdown
## /home/you/.gnupg/secring.gpg

sec 4096R/<YourKeyID> 2023-01-01 [expires: 2027-01-01]
uid Your Name <your@email.com>
```

Your KeyID is the part after 4096R/.

You can then export the public key using:

```bash
gpg --armor --export <key-id>
```

This will print your public key to the console. You can save this to a file or share it directly.

To encrypt data for someone else, you need their public key:

Receive Public Key: Obtain the recipient's public key file (often .asc or .gpg).

Import Key:

```bash
gpg --import /path/to/recipientkey.asc
```

Trust the Key (Optional): You might want to trust the imported key fully if you trust its authenticity.

```bash
gpg --edit-key <RecipientKeyID>
```

Then in the GPG console, type trust, choose the level of trust, and then quit.

#### Decrypting

To decrypt a file, you need the private key that matches the public key used to encrypt the file. Then you can run for example:

```bash
gpg --output backup.tar.gz --decrypt backup.tar.gz.gpg
```

Extract the tarball:

```bash
tar -xvzf backup.tar.gz
```

### Running

#### Create the docker-compose.yml file

```bash
wget https://raw.githubusercontent.com/rharkor/sss-backup/main/docker-compose.yml
```

#### Setup the environment variables

```bash
wget https://raw.githubusercontent.com/rharkor/sss-backup/main/.env.example -O .env
```

Modify the .env file with your own values

#### Setup your config file

```bash
wget https://raw.githubusercontent.com/rharkor/sss-backup/main/bkp-config.json.example -O bkp-config.json
```

Modify the bkp-config.json file with your own values

#### Run the container

```bash
docker compose up -d
```

## Development

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

```bash
docker build -t rg.fr-par.scw.cloud/sss-backup/sss-backup:latest -f docker/Dockerfile  .
docker push rg.fr-par.scw.cloud/sss-backup/sss-backup:latest
```
