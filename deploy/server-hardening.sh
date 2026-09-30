#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then echo "Run as root on the new server" >&2; exit 1; fi
: "${OPS_CIDR:?Set OPS_CIDR to the fixed operations IP/CIDR before running}"

apt-get update
apt-get install -y --no-install-recommends ufw fail2ban unattended-upgrades ca-certificates curl
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sshd -t
systemctl reload ssh
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$OPS_CIDR" to any port 22 proto tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban unattended-upgrades
