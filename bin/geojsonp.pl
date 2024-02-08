#!/usr/local/bin/perl -T
# Copyright (c) Feb 2024-2024 Wolfram Schneider, https://bbbike.org
#
# geojsonp.pl - generate a geojsonp file for Berlin OSM Stammtisch
#
# https://wiki.openstreetmap.org/wiki/Berlin/Stammtisch/Geschichte
#

use Getopt::Long;
use Text::CSV_XS qw/csv/;
use Data::Dumper;
use JSON;

use strict;
use warnings;

my $location_csv   = 'etc/location.csv';
my $stammtisch_csv = 'etc/stammtisch.csv';

my $debug = 0;
my $help  = 0;

sub usage {
    my $message = shift // "";

    die <<EOF;
@{[$message]}
    
usage: $0 [options]

--debug=0..2              debug option
EOF
}

sub parse_csv {
    my $file = shift;

    my $csv = Text::CSV_XS->new(
        {
            binary     => 1,
            auto_diag  => 1,
            sep_char   => '|',
            quote_char => q{"},
            eol        => $/
        }
    );

    open my $fh, "<:encoding(utf8)", $file or die "$file: $!";

    my @rows = ();
    while ( my $row = $csv->getline($fh) ) {

        #$row->[2] =~ m/pattern/ or next; # 3rd field should match
        push @rows, $row;
    }
    close $fh;

    return \@rows;
}

#############################################################################
# main
#
GetOptions(
    "debug=i" => \$debug,
    "help"    => \$help,
) or &usage;

&usage if $help;

my @location   = &parse_csv($location_csv);
my @stammtisch = &parse_csv($stammtisch_csv);

print Dumper( \@location );
print Dumper( \@stammtisch );

# EOF

