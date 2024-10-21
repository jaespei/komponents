FROM node
LABEL version="1.0"
LABEL maintainer="Javier Esparza-Peidro <jesparza@dsic.upv.es>"

#-------------------------------------------
# Dockerfile for building the sidecar image
#-------------------------------------------

# Default environment variables: may be redefined 
# using docker run --env <key>=<value>
#
# Environment variables


# Copy sidecar.js to container
COPY package.json /komponents/
COPY src /komponents/

# Change current working path
WORKDIR /komponents/

# Install iptables, netcat
RUN apt-get update && apt-get install -y iptables netcat
RUN npm install

# Block container
ENTRYPOINT sleep infinity