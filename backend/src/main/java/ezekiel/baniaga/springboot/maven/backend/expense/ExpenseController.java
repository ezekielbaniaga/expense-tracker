package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.expense.dto.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("api/expense")
public class ExpenseController {

    private final ExpenseService service;

    public ExpenseController(ExpenseService service) {
        this.service = service;
    }

    @GetMapping(version = "1.0")
    public ExpenseListResponse getExpenses(@AuthenticationPrincipal CustomUserDetails user) {
        return service.getAllExpenses(user.getUniqueId());
    }

    @GetMapping(version = "1.1")
    public ExpenseListResponseV1_1 getExpenseV1_1(@AuthenticationPrincipal CustomUserDetails user) {
        return service.getAllExpensesV1_1(user.getUniqueId());
    }

    @GetMapping(version = "1.2")
    public ExpenseListResponseV1_2 getExpenseV1_2(@AuthenticationPrincipal CustomUserDetails user) {
        return service.getAllExpensesV1_2(user.getUniqueId());
    }

    @GetMapping(value = "/archived")
    public ArchivedExpenseListResponse getArchivedExpenses(@AuthenticationPrincipal CustomUserDetails user) {
       return service.getArchivedExpenses(user.getUniqueId());
    }

    @PostMapping(version = "1.0+")
    public ExpenseResponse createExpense(@Valid @RequestBody CreateExpenseRequest request, @AuthenticationPrincipal CustomUserDetails user) {
        return service.addExpense(request, user.getUniqueId());
    }

    @GetMapping(value = "/categories", version = "1.0+")
    public AllCategoriesResponse getSupportedCategories() {
        return service.getAllCategories();
    }

    @GetMapping(value = "/{uniqueId}")
    public ExpenseResponse getByUniqueId(@PathVariable UUID uniqueId, @AuthenticationPrincipal CustomUserDetails user) {
        return service.getExpenseByUniqueId(uniqueId, user.getUniqueId());
    }

    @PutMapping(value = "/{uniqueId}")
    public ExpenseResponse update(@PathVariable UUID uniqueId, @Valid @RequestBody UpdateExpenseRequest request, @AuthenticationPrincipal CustomUserDetails user) {
        return service.updateExpense(uniqueId, user.getUniqueId(), request);
    }

    @DeleteMapping(value = "/{uniqueId}")
    public ResponseEntity<Void> deleteByUniqueId(@PathVariable UUID uniqueId, @RequestParam Long version, @AuthenticationPrincipal CustomUserDetails user) {
        service.deleteExpense(uniqueId, user.getUniqueId(), version);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping(value = "/{uniqueId}/description")
    public ExpenseResponse patchDescription(@PathVariable UUID uniqueId, @Valid @RequestBody PatchExpenseDescriptionRequest request, @AuthenticationPrincipal CustomUserDetails user) {
        return service.patchExpenseDescription(uniqueId, user.getUniqueId(), request);
    }
}
