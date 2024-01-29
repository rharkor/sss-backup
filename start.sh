#* Install the key of path $GPG_KEY_PATH
gpg --import $HOST_ROOT/$GPG_KEY_PATH >/dev/null

#* Start
npm run start
