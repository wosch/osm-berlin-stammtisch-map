#!/usr/bin/perl

use strict;
use warnings;

binmode(\*STDOUT, ":utf8");

my @superscript_digits = (
    "\N{SUPERSCRIPT ZERO}",
    "\N{SUPERSCRIPT ONE}",
    "\N{SUPERSCRIPT TWO}",
    "\N{SUPERSCRIPT THREE}",
    "\N{SUPERSCRIPT FOUR}",
    "\N{SUPERSCRIPT FIVE}",
    "\N{SUPERSCRIPT SIX}",
    "\N{SUPERSCRIPT SEVEN}",
    "\N{SUPERSCRIPT EIGHT}",
    "\N{SUPERSCRIPT NINE}"
);

my $superscript_digits_re = join '|', @superscript_digits;
print qq{Superscript digits regex: (?:$superscript_digits_re)}, "\n";

