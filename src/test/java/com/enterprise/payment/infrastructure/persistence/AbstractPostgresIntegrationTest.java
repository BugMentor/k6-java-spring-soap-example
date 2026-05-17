package com.enterprise.payment.infrastructure.persistence;

import com.enterprise.payment.domain.model.Merchant;
import com.enterprise.payment.domain.model.User;
import com.enterprise.payment.domain.model.Wallet;
import com.enterprise.payment.infrastructure.persistence.jpa.MerchantJpaRepository;
import com.enterprise.payment.infrastructure.persistence.jpa.UserJpaRepository;
import com.enterprise.payment.infrastructure.persistence.jpa.WalletJpaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.util.UUID;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
public abstract class AbstractPostgresIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("payments")
            .withUsername("user")
            .withPassword("password");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.url", postgres::getJdbcUrl);
        registry.add("spring.flyway.user", postgres::getUsername);
        registry.add("spring.flyway.password", postgres::getPassword);
    }

    @Autowired
    protected UserJpaRepository userJpaRepository;
    @Autowired
    protected MerchantJpaRepository merchantJpaRepository;
    @Autowired
    protected WalletJpaRepository walletJpaRepository;

    protected User testUser;
    protected Merchant testMerchant;
    protected Wallet testWallet;

    @BeforeEach
    void seedData() {
        walletJpaRepository.deleteAll();
        merchantJpaRepository.deleteAll();
        userJpaRepository.deleteAll();

        testUser = new User(null, "matias@example.com", "Matias Magni", "ACTIVE");
        userJpaRepository.save(testUser);

        testMerchant = new Merchant(null, "Enterprise Store", "api-key-123");
        merchantJpaRepository.save(testMerchant);

        testWallet = new Wallet(null, testUser, new BigDecimal("1000.00"), "USD");
        walletJpaRepository.save(testWallet);
    }
}
