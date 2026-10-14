package ezekiel.baniaga.springboot.maven.backend.user.dto;

import java.util.List;

/**
 * One page of users. page is zero-based; total counts every match.
 */
public record UserListResponse(
    List<AdminUserResponse> users,
    int page,
    int size,
    long total,
    int totalPages
){}
