package ezekiel.baniaga.springboot.maven.backend.expense.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "expense")
@Getter @Setter @NoArgsConstructor
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    private Long version;

    private UUID uniqueId;

    // users.unique_id of the owner, as carried in the JWT
    @Column(nullable = false, updatable = false)
    private UUID ownerId;

    private String description;
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    private Category category;

    private LocalDate expenseDate;
    private LocalDateTime createdAt;
    private LocalDateTime lastModified;
    private Boolean archived;
    private LocalDateTime archivedAt;
}
