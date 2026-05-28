package com.enterprise.payment.infrastructure.persistence;

import com.enterprise.payment.domain.model.Merchant;
import com.enterprise.payment.domain.model.User;
import com.enterprise.payment.domain.model.Wallet;
import com.enterprise.payment.infrastructure.persistence.jpa.MerchantJpaRepository;
import com.enterprise.payment.infrastructure.persistence.jpa.UserJpaRepository;
import com.enterprise.payment.infrastructure.persistence.jpa.WalletJpaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private static final UUID SEED_USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID SEED_MERCHANT_ID = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID SEED_WALLET_ID = UUID.fromString("33333333-3333-4333-8333-333333333333");

    private final UserJpaRepository userRepo;
    private final MerchantJpaRepository merchantRepo;
    private final WalletJpaRepository walletRepo;

    public DataSeeder(UserJpaRepository userRepo, MerchantJpaRepository merchantRepo, WalletJpaRepository walletRepo) {
        this.userRepo = userRepo;
        this.merchantRepo = merchantRepo;
        this.walletRepo = walletRepo;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (userRepo.findById(SEED_USER_ID).isPresent()) {
            log.info("Seed data already exists, skipping.");
            return;
        }

        log.info("Seeding test data for k6 load tests...");

        User user = new User(SEED_USER_ID, "k6-loadtest@k6.io", "K6 LoadTest User", "ACTIVE");
        userRepo.save(user);

        Merchant merchant = new Merchant(SEED_MERCHANT_ID, "K6 LoadTest Merchant", "k6-api-key-loadtest");
        merchantRepo.save(merchant);

        Wallet wallet = new Wallet(SEED_WALLET_ID, user, new BigDecimal("9999999.9900"), "USD");
        walletRepo.save(wallet);

        log.info("Seed data created: user={}, merchant={}, wallet={}", SEED_USER_ID, SEED_MERCHANT_ID, SEED_WALLET_ID);
    }
}
