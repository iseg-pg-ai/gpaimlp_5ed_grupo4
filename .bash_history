cd dmc-workspace
npm ci
npm install -g npm@11.21.0
nvm install 22.13.0
npm install 22.1.3.0
npm install 22.13.0
docker pull node:22-slim
# Create a Node.js container and start a Shell session:
docker run -it --rm --entrypoint sh node:22-slim
# Verify the Node.js version:
node -v # Should print "v22.23.3".
# Verify npm version:
npm -v # Should print "10.9.9".
npm ci
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 22.13.0
