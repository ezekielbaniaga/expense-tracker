package ezekiel.baniaga.springboot.maven.backend.ratelimit;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.regex.Pattern;

/**
 * The rate limit key for a client IP. One IPv6 host usually controls a whole /64 (2^64
 * addresses), so keying by the full address would give it a fresh bucket per address;
 * IPv6 addresses are reduced to their /64 prefix instead. IPv4 stays as is.
 * <p>
 * A zone id ({@code fe80::1%eth0}) and brackets are dropped, and an IPv4-mapped address
 * ({@code ::ffff:192.0.2.1}) counts as its IPv4 address (its /64 would be all of IPv4).
 * Anything that doesn't parse is returned unchanged, never throwing.
 */
public final class ClientIpKey {

    // Only these characters, so InetAddress parses a literal and never does a DNS lookup
    private static final Pattern IPV6_LITERAL = Pattern.compile("[0-9A-Fa-f:.]+");

    private ClientIpKey() {
    }

    public static String of(String remoteAddr) {
        if (remoteAddr == null || remoteAddr.indexOf(':') < 0) {
            return remoteAddr;
        }

        String literal = remoteAddr;
        if (literal.startsWith("[") && literal.endsWith("]")) {
            literal = literal.substring(1, literal.length() - 1);
        }
        int zone = literal.indexOf('%');
        if (zone >= 0) {
            literal = literal.substring(0, zone);
        }
        if (!IPV6_LITERAL.matcher(literal).matches()) {
            return remoteAddr;
        }

        InetAddress address;
        try {
            address = InetAddress.getByName(literal);
        } catch (UnknownHostException e) {
            return remoteAddr;
        }

        if (address instanceof Inet4Address) {
            return address.getHostAddress();
        }
        if (!(address instanceof Inet6Address)) {
            return remoteAddr;
        }

        byte[] bytes = address.getAddress();
        return String.format("%x:%x:%x:%x::/64",
            group(bytes, 0), group(bytes, 2), group(bytes, 4), group(bytes, 6));
    }

    private static int group(byte[] bytes, int index) {
        return ((bytes[index] & 0xff) << 8) | (bytes[index + 1] & 0xff);
    }
}
