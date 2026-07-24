#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${INSTALL_DIR:-/opt/clawchat-bridge}"
INSTANCE="${1:-default}"

echo "===== ClawChat Bridge Systemd Install ====="
echo "Instance: $INSTANCE"
echo "Project:  $PROJECT_DIR"
echo "Install:  $INSTALL_DIR"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo "Creating $INSTALL_DIR ..."
  mkdir -p "$INSTALL_DIR"
fi

echo "Copying files to $INSTALL_DIR ..."
cp -r "$PROJECT_DIR"/dist "$INSTALL_DIR/"
cp "$PROJECT_DIR"/watchdog.js "$INSTALL_DIR/"
cp "$PROJECT_DIR"/package.json "$INSTALL_DIR/"
cp "$PROJECT_DIR"/package-lock.json "$INSTALL_DIR/"

if [ ! -d "$INSTALL_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  cd "$INSTALL_DIR"
  npm install --production
fi

SERVICE_FILE="clawchat-bridge${INSTANCE:+-$INSTANCE}.service"
echo "Installing systemd service: $SERVICE_FILE"
cp "$SCRIPT_DIR/$SERVICE_FILE" /etc/systemd/system/

systemctl daemon-reload
systemctl enable "$SERVICE_FILE"

echo ""
echo "===== Installation Complete ====="
echo "Start:    sudo systemctl start $SERVICE_FILE"
echo "Status:   sudo systemctl status $SERVICE_FILE"
echo "Stop:     sudo systemctl stop $SERVICE_FILE"
echo "Logs:     journalctl -u $SERVICE_FILE -f"
