# Copyright (c) 2024-2024 Wolfram Schneider, https://bbbike.org

all: help
SCRIPT= ./bin/geojsonp.pl

update:
	${SCRIPT}

perlcheck:
	perl -T -cw ${SCRIPT}

perltidy: perlcheck
	perltidy -b ${SCRIPT}


help:
	@echo "make -s update"
	@echo "make perltidy"

