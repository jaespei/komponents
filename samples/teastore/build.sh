#!/bin/bash
rm -fr TeaStore
git clone https://github.com/DescartesResearch/TeaStore.git
cp -r src/utilities TeaStore/
cd TeaStore
mvn clean install -DskipTests
cd tools
./build_docker.sh
#docker run -d -p 5000:5000 --name registry registry:2
docker tag descartesresearch/teastore-db localhost:5000/teastore-db
docker push localhost:5000/teastore-db
docker tag descartesresearch/teastore-persistence localhost:5000/teastore-persistence
docker push localhost:5000/teastore-persistence
docker tag descartesresearch/teastore-auth localhost:5000/teastore-auth
docker push localhost:5000/teastore-auth
docker tag descartesresearch/teastore-webui localhost:5000/teastore-webui
docker push localhost:5000/teastore-webui
docker tag descartesresearch/teastore-image localhost:5000/teastore-image
docker push localhost:5000/teastore-image
docker tag descartesresearch/teastore-recommender localhost:5000/teastore-recommender
docker push localhost:5000/teastore-recommender