package ezekiel.baniaga.springboot.maven.backend.ratelimit;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClientIpKeyTests {

    @Test
    void ipv4IsUnchanged() {
        assertThat(ClientIpKey.of("192.0.2.1")).isEqualTo("192.0.2.1");
        assertThat(ClientIpKey.of("127.0.0.1")).isEqualTo("127.0.0.1");
    }

    @Test
    void ipv6IsReducedToItsSlash64() {
        assertThat(ClientIpKey.of("2001:db8::1")).isEqualTo("2001:db8:0:0::/64");
        assertThat(ClientIpKey.of("2001:db8::2")).isEqualTo("2001:db8:0:0::/64");
        assertThat(ClientIpKey.of("2001:db8:0:0:ffff:ffff:ffff:ffff")).isEqualTo("2001:db8:0:0::/64");
        assertThat(ClientIpKey.of("2001:db8:0:1::1")).isEqualTo("2001:db8:0:1::/64");
    }

    @Test
    void ipv6SpellingsOfOneAddressGiveOneKey() {
        // Tomcat gives the full form (0:0:0:0:0:0:0:1), a proxy may forward the short one
        assertThat(ClientIpKey.of("0:0:0:0:0:0:0:1")).isEqualTo(ClientIpKey.of("::1"));
        assertThat(ClientIpKey.of("2001:DB8::1")).isEqualTo("2001:db8:0:0::/64");
        assertThat(ClientIpKey.of("[2001:db8::1]")).isEqualTo("2001:db8:0:0::/64");
    }

    @Test
    void zoneIdIsDropped() {
        assertThat(ClientIpKey.of("fe80::1%eth0")).isEqualTo("fe80:0:0:0::/64");
        assertThat(ClientIpKey.of("fe80::1%2")).isEqualTo("fe80:0:0:0::/64");
    }

    @Test
    void ipv4MappedCountsAsItsIpv4Address() {
        // Its /64 would be ::ffff:0:0/64, i.e. every IPv4 client in one bucket
        assertThat(ClientIpKey.of("::ffff:192.0.2.1")).isEqualTo("192.0.2.1");
        assertThat(ClientIpKey.of("::ffff:192.0.2.2")).isEqualTo("192.0.2.2");
    }

    @Test
    void malformedValuesAreReturnedUnchanged() {
        assertThat(ClientIpKey.of(null)).isNull();
        assertThat(ClientIpKey.of("")).isEmpty();
        assertThat(ClientIpKey.of("unknown")).isEqualTo("unknown");
        assertThat(ClientIpKey.of("2001:db8::zz")).isEqualTo("2001:db8::zz");
        assertThat(ClientIpKey.of("1:2:3:4:5:6:7:8:9")).isEqualTo("1:2:3:4:5:6:7:8:9");
        assertThat(ClientIpKey.of(":::")).isEqualTo(":::");
        assertThat(ClientIpKey.of("example.com:443")).isEqualTo("example.com:443");
    }
}
