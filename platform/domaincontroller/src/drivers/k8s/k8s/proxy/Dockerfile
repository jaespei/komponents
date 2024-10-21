FROM node
LABEL version="1.0"
LABEL maintainer="Javier Esparza-Peidro <jesparza@dsic.upv.es>"

#-------------------------------------------
# Dockerfile for building the proxy image
#-------------------------------------------

# Default environment variables: may be redefined 
# using docker run --env <key>=<value>
#
# Environment variables
ENV HOST=0.0.0.0
ENV API=127.0.0.1:10001
#ENV GW=127.0.0.1:10002
#ENV DEST=127.0.0.1:10003

# Copy sources to container
COPY package.json /komponents/
COPY src /komponents/

# Change current working path
WORKDIR /komponents/

# Install netcat
RUN apt-get update && apt-get install -y netcat
RUN npm install

# Start proxy
ENTRYPOINT node cli start -h $HOST -a $API