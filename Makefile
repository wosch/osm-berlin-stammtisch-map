# Copyright (c) Feb 2024-2024 Wolfram Schneider, https://bbbike.org

all: help
SCRIPT= perl ./bin/geojsonp.pl
FILE=	www/osm-berlin.geojsonp
DOCKER_BUILD_FLAGS?=	--no-cache

update:
	${SCRIPT} > ${FILE}.tmp
	mv -f ${FILE}.tmp ${FILE}

perlcheck:
	perl -T -cw ${SCRIPT}

perltidy: perlcheck
	perltidy -b ${SCRIPT}

docker-build:
	docker build ${DOCKER_BUILD_FLAGS} -t osm/berlin/stammtisch -f ./Dockerfile .
docker-run:
	docker run -it --rm -v $$(pwd):/osm-berlin-stammtisch-map osm/berlin/stammtisch

clean:
	rm -f bin/*.bak
distclean:
	git clean -fdx

help:
	@echo "make -s update"
	@echo "make docker-build"
	@echo "make docker-run"
	@echo "make perltidy"
	@echo "make clean"

