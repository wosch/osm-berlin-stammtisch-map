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

    #open my $fh, "<:encoding(utf8)", $file or die "$file: $!";
    open my $fh, "<", $file or die "$file: $!";
    binmode( $fh, ":raw" );

    my @rows = ();
    while ( my $row = $csv->getline($fh) ) {

        #$row->[2] =~ m/pattern/ or next; # 3rd field should match
        push @rows, $row;
    }
    close $fh;

    return \@rows;
}

sub name_norm {
    my $name = shift;

    my $x = $name;
    $name = lc($name);
    $name =~ s/\s*[,\(]\s*.*//;
    $name =~ s/\s+\-.*//;

    return $name;
}

sub location_hash {
    my $l = shift;

    die "missing list\n" if ref $l ne 'ARRAY';

    my @location = @$l;
    my $hash;

    foreach my $loc (@location) {
        my ( $lon, $lat, $name, $street, $city ) = @$loc;
        my $name_norm = name_norm($name);

        $hash->{$name_norm} = {
            'lon'       => $lon,
            'lat'       => $lat,
            'name'      => $name,
            'street'    => $street // '',
            'city'      => $city   // '',
            'name_norm' => $name_norm
        };
        warn "$lon, $lat, $name, $street, $city, $name_norm\n" if $debug >= 2;
    }

    return $hash;
}

sub geojsonp {
    my $location   = shift;
    my $stammtisch = shift;

    my $hash;
    foreach my $s (@$stammtisch) {
        my ( $number, $date, $name, $wiki_count, $real_count ) = @$s;
        my $name_norm = name_norm($name);
        $real_count = 'N/A' if $real_count eq '';

        #warn "$number, $date, $name, $wiki_count, $real_count :: $name_norm\n";

        if ( !exists $hash->{$name_norm} ) {
            if ( !exists $location->{$name_norm} ) {
                warn "xxx: name=$name name_norm=$name_norm\n";
            }

#$hash->{ $name_norm } = "bla"; #"<b>" . $location->{$name_norm}->{'name'} . "</b> : "; # .
#$location->{$name_norm}->{'street'} . " : " .  $location->{$name_norm}->{'city'} . "<br> " .
#$number . ". " . $date . " : " . $real_count . "<br>";
        }
        else {
            $hash->{$name_norm} .=
              $number . ". " . $date . " : " . $real_count . "<br>";
        }
    }

    return $hash;
}

#############################################################################
# main
#
binmode( \*STDOUT, ":raw" );
binmode( \*STDERR, ":raw" );

GetOptions(
    "debug=i" => \$debug,
    "help"    => \$help,
) or &usage;

&usage if $help;

my $l          = &parse_csv($location_csv);
my $location   = &location_hash($l);
my $stammtisch = &parse_csv($stammtisch_csv);

print Dumper($location);
my $result = &geojsonp( $location, $stammtisch );

#print Dumper($result);

#print Dumper( \@stammtisch );
#print Dumper( $location );

# EOF

