package com.enterprise.payment.infrastructure.persistence;

import com.enterprise.payment.domain.model.Merchant;
import com.enterprise.payment.domain.model.Payment;
import com.enterprise.payment.domain.model.PaymentSummary;
import com.enterprise.payment.domain.model.User;
import com.enterprise.payment.domain.model.Wallet;
import com.enterprise.payment.infrastructure.persistence.jpa.MerchantJpaRepository;
import com.enterprise.payment.infrastructure.persistence.jpa.PaymentJpaRepository;
import com.enterprise.payment.infrastructure.persistence.jpa.UserJpaRepository;
import com.enterprise.payment.infrastructure.persistence.jpa.WalletJpaRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class PaymentJpaRepositoryIntegrationTest extends AbstractH2IntegrationTest {

    @Autowired
    private PaymentJpaRepository paymentJpaRepository;

    @Autowired
    private UserJpaRepository userJpaRepository;

    @Autowired
    private MerchantJpaRepository merchantJpaRepository;

    @Autowired
    private WalletJpaRepository walletJpaRepository;

    @Test
    @DisplayName("Should save and retrieve payments with all relationships")
    void shouldSaveAndRetrievePayments() {
        // Create test entities
        User user = new User(null, "payment@test.com", "Payment User", "ACTIVE");
        userJpaRepository.save(user);

        Merchant merchant = new Merchant(null, "Payment Merchant", "PAY-MERCH-001");
        merchantJpaRepository.save(merchant);

        Wallet wallet = new Wallet(null, user, new BigDecimal("500.00"), "USD");
        walletJpaRepository.save(wallet);

        Instant now = Instant.now();

        // Save single payment
        Payment p1 = new Payment(UUID.randomUUID(), user, merchant, wallet, new BigDecimal("150.00"), "DEBIT", "PENDING", now, 0L);
        Payment saved = paymentJpaRepository.save(p1);
        assertNotNull(saved.getId());

        // Save batch
        List<Payment> batch = List.of(
            new Payment(UUID.randomUUID(), user, merchant, wallet, new BigDecimal("50.00"), "DEBIT", "SUCCESS", now, 0L),
            new Payment(UUID.randomUUID(), user, merchant, wallet, new BigDecimal("200.00"), "CREDIT", "SUCCESS", now, 0L)
        );
        paymentJpaRepository.saveAll(batch);

        // Verify all payments saved
        List<Payment> allPayments = paymentJpaRepository.findAll();
        assertTrue(allPayments.size() >= 3);
    }

    @Test
    @DisplayName("Should find payments by status")
    void shouldFindByStatus() {
        // Setup
        User user = new User(null, "status@test.com", "Status User", "ACTIVE");
        userJpaRepository.save(user);

        Merchant merchant = new Merchant(null, "Status Merchant", "STATUS-001");
        merchantJpaRepository.save(merchant);

        Wallet wallet = new Wallet(null, user, new BigDecimal("1000.00"), "USD");
        walletJpaRepository.save(wallet);

        Instant now = Instant.now();

        // Create payments with different statuses
        paymentJpaRepository.save(new Payment(UUID.randomUUID(), user, merchant, wallet, new BigDecimal("100.00"), "DEBIT", "PENDING", now, 0L));
        paymentJpaRepository.save(new Payment(UUID.randomUUID(), user, merchant, wallet, new BigDecimal("200.00"), "DEBIT", "SUCCESS", now, 0L));
        paymentJpaRepository.save(new Payment(UUID.randomUUID(), user, merchant, wallet, new BigDecimal("300.00"), "DEBIT", "FAILED", now, 0L));

        // Find all payments and filter by status (JPA doesn't have findByStatus by default)
        List<Payment> allPayments = paymentJpaRepository.findAll();
        List<Payment> successPayments = allPayments.stream()
            .filter(p -> "SUCCESS".equals(p.getStatus()))
            .toList();

        assertEquals(1, successPayments.size());
        assertEquals("SUCCESS", successPayments.get(0).getStatus());
    }

    @Test
    @DisplayName("Should handle optimistic locking via @Version")
    void shouldHandleOptimisticLocking() {
        // Setup
        User user = new User(null, "version@test.com", "Version User", "ACTIVE");
        userJpaRepository.save(user);

        Merchant merchant = new Merchant(null, "Version Merchant", "VERSION-001");
        merchantJpaRepository.save(merchant);

        Wallet wallet = new Wallet(null, user, new BigDecimal("1000.00"), "USD");
        walletJpaRepository.save(wallet);

        Instant now = Instant.now();

        // Create payment
        Payment original = new Payment(UUID.randomUUID(), user, merchant, wallet, new BigDecimal("100.00"), "DEBIT", "PENDING", now, 0L);
        Payment saved = paymentJpaRepository.save(original);

        // Update payment (version should increment)
        saved = new Payment(saved.getId(), saved.getUser(), saved.getMerchant(), saved.getWallet(),
            saved.getAmount(), saved.getType(), "SUCCESS", saved.getCreatedAt(), saved.getVersion());
        Payment updated = paymentJpaRepository.save(saved);

        assertNotNull(updated.getVersion());
        assertTrue(updated.getVersion() >= 1);
    }
}