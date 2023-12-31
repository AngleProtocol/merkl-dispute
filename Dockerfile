# Use an official Node.js runtime as the builder image
FROM node:20-alpine

ARG GITHUB_TOKEN

ENV GITHUB_TOKEN $GITHUB_TOKEN

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json file to the container
COPY package.json ./

# Copy the yarn.lock file to the container
COPY yarn.lock ./

COPY .npmrc ./

# Install the app dependencies
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> .npmrc
RUN yarn install --frozen-lockfile && yarn cache clean
RUN rm -f .npmrc

# Copy the tsconfig.json to be able to compile the typescript
COPY tsconfig.json ./

# Copy the code
COPY ./src ./src

# Build the app
RUN yarn build

# Expose the port that the app listens on
EXPOSE 5002

# Launch the app for local development (hot reloading)
CMD ["yarn", "start"]
