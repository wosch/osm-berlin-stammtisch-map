# Copyright (c) 2024-2024 Wolfram Schneider, https://bbbike.org

all: help
SCRIPT= ./bin/geojsonp.pl
FILE=	www/osm-berlin.geojsonp

update:
	${SCRIPT} > ${FILE}.tmp
	mv -f ${FILE}.tmp ${FILE}

perlcheck:
	perl -T -cw ${SCRIPT}

perltidy: perlcheck
	perltidy -b ${SCRIPT}


help:
	@echo "make -s update"
	@echo "make perltidy"

