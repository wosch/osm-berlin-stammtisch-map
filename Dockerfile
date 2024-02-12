FROM debian:bullseye-slim
MAINTAINER Wolfram Schneider <wosch@FreeBSD.org>

RUN apt-get update -q && \
  apt-get upgrade -y && \
  env RUN_MANDB=no apt-get install -y git make perl && \
  apt-get clean

# required perl modules
RUN apt-get install -y libtext-csv-xs-perl libjson-perl

RUN useradd -ms /bin/bash bbbike
USER bbbike

RUN /bin/bash

