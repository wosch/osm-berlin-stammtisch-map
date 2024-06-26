#!/usr/local/bin/perl
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

my $debug = 1;
my $help  = 0;

sub usage {
    my $message = shift // "";

    die <<EOF;
@{[$message]}
    
usage: $0 [options]

--debug=0..2              debug option, default $debug
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

    open my $fh, "<", $file or die "$file: $!";
    binmode( $fh, ":raw" );

    #open my $fh, "<:encoding(utf8)", $file or die "$file: $!";

    my @rows = ();
    while ( my $row = $csv->getline($fh) ) {
        push @rows, $row;
    }
    close $fh;

    return \@rows;
}

sub name_norm {
    my $name = shift;

    # lowercase, commas, etc.
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
        my ( $lon, $lat, $name, $street, $city, $homepage ) = @$loc;
        my $name_norm = name_norm($name);

        $hash->{$name_norm} = {
            'lon'       => $lon,
            'lat'       => $lat,
            'name'      => $name,
            'street'    => $street   // '',
            'city'      => $city     // '',
            'homepage'  => $homepage // '',
            'name_norm' => $name_norm
        };
        warn "$lon, $lat, $name, $street, $city, $name_norm\n" if $debug >= 2;
    }

    return $hash;
}

sub homepage {
    my $name = shift;
    my $url  = shift;

    return qq[<b>$name</b>];

    # XXX
    if ( !$url ) {
        return qq[<b>$name</b>];
    }
    else {
        return qq[<b><a target='_new' href='$url'>$name</a></b>];
    }
}

sub date_class {
    my $date = shift;
    my $text = shift;

    my ($year) = ( $date =~ m,(\d{4})$, );
    return qq[<span class='y${year}'>$text</span>];
}

sub geojsonp {
    my $location   = shift;
    my $stammtisch = shift;

    my $hash;
    foreach my $s (@$stammtisch) {
        my ( $number, $date, $name, $wiki_count, $real_count ) = @$s;
        my $name_norm = name_norm($name);

        if ( !$real_count ) {
            $real_count = $wiki_count || 'N/A';
        }

        # first entry (last meeting)
        if ( !exists $hash->{$name_norm} ) {
            if ( !exists $location->{$name_norm} ) {
                warn "Missing location name=$name name_norm=$name_norm\n"
                  if $debug >= 1;
                next;
            }

            $hash->{$name_norm} = homepage(
                $location->{$name_norm}->{'name'},
                $location->{$name_norm}->{'homepage'}
              )
              . " : "
              . $location->{$name_norm}->{'street'} . " : "
              . $location->{$name_norm}->{'city'} . "<br> "
              . &date_class( $date, qq[$number) $date : $real_count<br>] );
        }

        # earlier meetings
        else {
            $hash->{$name_norm} .=
              &date_class( $date, qq[$number) $date : $real_count<br>] );
        }
    }

    return $hash;
}

#
# geoJsonResponse({
#    "features" : [
#      {
#         "geometry" : {
#            "coordinates" : [
#               "13.35835",
#               "52.52327"
#            ],
#            "type" : "Point"
#         },
#         "properties" : {
#            "cat" : "X",
#            "name" : "<b>Restaurant Neumann's</b> : Alt-Moabit 126 : Moabit<br>\n* 2024-01-31 : 7"
#         },
#         "type" : "Feature"
#      },
#   ],
#   "type" : "FeatureCollection"
#}
#);

# returns a perl object for geoJson
sub geojson_obj {
    my $location    = shift;
    my $description = shift;

    my @list;

    foreach my $key ( sort keys %$description ) {
        my $obj = $location->{$key};

        my $h = {
            "geometry" => {
                "coordinates" => [ $obj->{"lon"}, $obj->{"lat"} ],
                "type"        => "Point"
            },
            "properties" => {
                "cat"  => "X",
                "name" => $description->{$key}
            },
            "type" => "Feature"
        };

        push @list, $h;
    }

    return { "features" => \@list, "type" => "FeatureCollection" };
}

sub print_geojson {
    my $geojson_obj = shift;

    my $data = JSON->new->allow_nonref->canonical->pretty->encode($geojson_obj);

    print "// auto-generated by geojsonp.pl - do not edit\n";
    print "geoJsonResponse(\n", $data, ");\n";
}

sub check_descriptions {
    my $location    = shift;
    my $description = shift;

    foreach my $l ( sort keys %$location ) {
        warn "Missing: $l\n" if !exists $description->{$l};
    }
}

#############################################################################
# main
#
binmode( \*STDIN,  ":utf8" );
binmode( \*STDOUT, ":utf8" );
binmode( \*STDERR, ":utf8" );

GetOptions(
    "debug=i" => \$debug,
    "help"    => \$help,
) or &usage;

&usage if $help;

my $l          = &parse_csv($location_csv);
my $location   = &location_hash($l);
my $stammtisch = &parse_csv($stammtisch_csv);

my $description = &geojsonp( $location, $stammtisch );
my $geojson_obj = &geojson_obj( $location, $description );
&print_geojson($geojson_obj);

if ( $debug >= 1 ) {
    warn "Found locations: ", scalar( keys %$location ),
      " number of meetings: ", scalar(@$stammtisch), "\n";
    warn "Found descriptions ", scalar( keys %$description ), "\n";
    &check_descriptions( $location, $description );
}

#warn Dumper($location);
#warn Dumper($description);
#warn Dumper($geojson_obj);

# EOF

