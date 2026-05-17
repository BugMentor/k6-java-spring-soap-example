package com.enterprise.payment.presentation.soap;

import com.enterprise.payment.application.usecase.GetPaymentUseCase;
import com.enterprise.payment.application.usecase.GetPaymentSummaryUseCase;
import com.enterprise.payment.application.usecase.ListUserPaymentsUseCase;
import com.enterprise.payment.application.usecase.ProcessPaymentUseCase;
import com.enterprise.payment.application.usecase.RefundPaymentUseCase;
import com.enterprise.payment.application.usecase.SearchPaymentsUseCase;
import com.enterprise.payment.domain.model.Merchant;
import com.enterprise.payment.domain.model.Payment;
import com.enterprise.payment.domain.model.PaymentSummary;
import com.enterprise.payment.domain.model.User;
import com.enterprise.payment.infrastructure.persistence.jpa.MerchantJpaRepository;
import com.enterprise.payment.infrastructure.persistence.jpa.UserJpaRepository;
import org.springframework.ws.server.endpoint.annotation.Endpoint;
import org.springframework.ws.server.endpoint.annotation.PayloadRoot;
import org.springframework.ws.server.endpoint.annotation.RequestPayload;
import org.springframework.ws.server.endpoint.annotation.ResponsePayload;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import javax.xml.parsers.DocumentBuilderFactory;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Endpoint
public class PaymentEndpoint {
    private static final String NAMESPACE_URI = "http://enterprise.com/payment-service";

    private final GetPaymentUseCase getPaymentUseCase;
    private final ProcessPaymentUseCase processPaymentUseCase;
    private final RefundPaymentUseCase refundPaymentUseCase;
    private final ListUserPaymentsUseCase listUserPaymentsUseCase;
    private final SearchPaymentsUseCase searchPaymentsUseCase;
    private final GetPaymentSummaryUseCase getPaymentSummaryUseCase;
    private final UserJpaRepository userJpaRepository;
    private final MerchantJpaRepository merchantJpaRepository;

    public PaymentEndpoint(GetPaymentUseCase getPaymentUseCase,
                           ProcessPaymentUseCase processPaymentUseCase,
                           RefundPaymentUseCase refundPaymentUseCase,
                           ListUserPaymentsUseCase listUserPaymentsUseCase,
                           SearchPaymentsUseCase searchPaymentsUseCase,
                           GetPaymentSummaryUseCase getPaymentSummaryUseCase,
                           UserJpaRepository userJpaRepository,
                           MerchantJpaRepository merchantJpaRepository) {
        this.getPaymentUseCase = getPaymentUseCase;
        this.processPaymentUseCase = processPaymentUseCase;
        this.refundPaymentUseCase = refundPaymentUseCase;
        this.listUserPaymentsUseCase = listUserPaymentsUseCase;
        this.searchPaymentsUseCase = searchPaymentsUseCase;
        this.getPaymentSummaryUseCase = getPaymentSummaryUseCase;
        this.userJpaRepository = userJpaRepository;
        this.merchantJpaRepository = merchantJpaRepository;
    }

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "GetPaymentByIdRequest")
    @ResponsePayload
    public Element getPayment(@RequestPayload Element request) throws Exception {
        String idStr = request.getElementsByTagNameNS(NAMESPACE_URI, "id").item(0).getTextContent();
        Payment payment = getPaymentUseCase.execute(UUID.fromString(idStr))
                .orElseThrow(() -> new RuntimeException("Not Found"));

        var doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        Element response = doc.createElementNS(NAMESPACE_URI, "GetPaymentByIdResponse");
        Element pElem = doc.createElementNS(NAMESPACE_URI, "payment");
        appendPaymentFields(doc, pElem, payment);
        response.appendChild(pElem);
        return response;
    }

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "ProcessPaymentRequest")
    @ResponsePayload
    public Element processPayment(@RequestPayload Element request) throws Exception {
        String userId = request.getElementsByTagNameNS(NAMESPACE_URI, "userId").item(0).getTextContent();
        String merchantId = request.getElementsByTagNameNS(NAMESPACE_URI, "merchantId").item(0).getTextContent();
        String amountStr = request.getElementsByTagNameNS(NAMESPACE_URI, "amount").item(0).getTextContent();
        String type = request.getElementsByTagNameNS(NAMESPACE_URI, "type").item(0).getTextContent();

        User user = userJpaRepository.findById(UUID.fromString(userId))
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        Merchant merchant = merchantJpaRepository.findById(UUID.fromString(merchantId))
                .orElseThrow(() -> new IllegalArgumentException("Merchant not found: " + merchantId));

        Payment payment = new Payment(
                UUID.randomUUID(), user, merchant, null,
                new BigDecimal(amountStr), type, "PENDING", Instant.now(), null);

        Payment saved = processPaymentUseCase.execute(payment);

        var doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        Element response = doc.createElementNS(NAMESPACE_URI, "ProcessPaymentResponse");
        Element pElem = doc.createElementNS(NAMESPACE_URI, "payment");
        appendPaymentFields(doc, pElem, saved);
        response.appendChild(pElem);
        return response;
    }

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "RefundPaymentRequest")
    @ResponsePayload
    public Element refundPayment(@RequestPayload Element request) throws Exception {
        String idStr = request.getElementsByTagNameNS(NAMESPACE_URI, "id").item(0).getTextContent();
        Payment refunded = refundPaymentUseCase.execute(UUID.fromString(idStr));

        var doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        Element response = doc.createElementNS(NAMESPACE_URI, "RefundPaymentResponse");
        Element pElem = doc.createElementNS(NAMESPACE_URI, "payment");
        appendPaymentFields(doc, pElem, refunded);
        response.appendChild(pElem);
        return response;
    }

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "ListUserPaymentsRequest")
    @ResponsePayload
    public Element listUserPayments(@RequestPayload Element request) throws Exception {
        String userId = request.getElementsByTagNameNS(NAMESPACE_URI, "userId").item(0).getTextContent();
        var statusNodes = request.getElementsByTagNameNS(NAMESPACE_URI, "status");
        var limitNodes = request.getElementsByTagNameNS(NAMESPACE_URI, "limit");

        String status = statusNodes.getLength() > 0 ? statusNodes.item(0).getTextContent() : "SUCCESS";
        int limit = limitNodes.getLength() > 0 ? Integer.parseInt(limitNodes.item(0).getTextContent()) : 10;

        List<Payment> payments = listUserPaymentsUseCase.execute(userId, status, limit);

        var doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        Element response = doc.createElementNS(NAMESPACE_URI, "ListUserPaymentsResponse");
        Element paymentsElem = doc.createElementNS(NAMESPACE_URI, "payments");
        for (Payment p : payments) {
            Element pElem = doc.createElementNS(NAMESPACE_URI, "payment");
            appendPaymentFields(doc, pElem, p);
            paymentsElem.appendChild(pElem);
        }
        response.appendChild(paymentsElem);
        return response;
    }

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "SearchPaymentsRequest")
    @ResponsePayload
    public Element searchPayments(@RequestPayload Element request) throws Exception {
        var minAmountNodes = request.getElementsByTagNameNS(NAMESPACE_URI, "minAmount");
        var maxAmountNodes = request.getElementsByTagNameNS(NAMESPACE_URI, "maxAmount");
        var currencyNodes = request.getElementsByTagNameNS(NAMESPACE_URI, "currency");
        var statusNodes = request.getElementsByTagNameNS(NAMESPACE_URI, "status");
        var pageNodes = request.getElementsByTagNameNS(NAMESPACE_URI, "page");
        var sizeNodes = request.getElementsByTagNameNS(NAMESPACE_URI, "size");

        BigDecimal minAmount = minAmountNodes.getLength() > 0 ? new BigDecimal(minAmountNodes.item(0).getTextContent()) : null;
        BigDecimal maxAmount = maxAmountNodes.getLength() > 0 ? new BigDecimal(maxAmountNodes.item(0).getTextContent()) : null;
        String currency = currencyNodes.getLength() > 0 ? currencyNodes.item(0).getTextContent() : null;
        String status = statusNodes.getLength() > 0 ? statusNodes.item(0).getTextContent() : null;
        int page = pageNodes.getLength() > 0 ? Integer.parseInt(pageNodes.item(0).getTextContent()) : 0;
        int size = sizeNodes.getLength() > 0 ? Integer.parseInt(sizeNodes.item(0).getTextContent()) : 10;

        List<Payment> payments = searchPaymentsUseCase.execute(minAmount, maxAmount, currency, status, page, size);

        var doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        Element response = doc.createElementNS(NAMESPACE_URI, "SearchPaymentsResponse");
        Element paymentsElem = doc.createElementNS(NAMESPACE_URI, "payments");
        for (Payment p : payments) {
            Element pElem = doc.createElementNS(NAMESPACE_URI, "payment");
            appendPaymentFields(doc, pElem, p);
            paymentsElem.appendChild(pElem);
        }
        response.appendChild(paymentsElem);
        return response;
    }

    @PayloadRoot(namespace = NAMESPACE_URI, localPart = "GetPaymentSummaryRequest")
    @ResponsePayload
    public Element getPaymentSummary(@RequestPayload Element request) throws Exception {
        String startDateStr = request.getElementsByTagNameNS(NAMESPACE_URI, "startDate").item(0).getTextContent();
        String endDateStr = request.getElementsByTagNameNS(NAMESPACE_URI, "endDate").item(0).getTextContent();

        Instant startDate = Instant.parse(startDateStr);
        Instant endDate = Instant.parse(endDateStr);

        PaymentSummary summary = getPaymentSummaryUseCase.execute(startDate, endDate);

        var doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        Element response = doc.createElementNS(NAMESPACE_URI, "GetPaymentSummaryResponse");
        Element entriesElem = doc.createElementNS(NAMESPACE_URI, "entries");
        for (Map.Entry<String, BigDecimal> entry : summary.getTotalsByStatus().entrySet()) {
            Element entryElem = doc.createElementNS(NAMESPACE_URI, "entry");
            Element statusElem = doc.createElementNS(NAMESPACE_URI, "status");
            statusElem.setTextContent(entry.getKey());
            entryElem.appendChild(statusElem);
            Element totalElem = doc.createElementNS(NAMESPACE_URI, "total");
            totalElem.setTextContent(entry.getValue().toString());
            entryElem.appendChild(totalElem);
            entriesElem.appendChild(entryElem);
        }
        response.appendChild(entriesElem);
        return response;
    }

    private void appendPaymentFields(Document doc, Element pElem, Payment payment) {
        Element idElem = doc.createElementNS(NAMESPACE_URI, "id");
        idElem.setTextContent(payment.getId().toString());
        pElem.appendChild(idElem);

        Element customerIdElem = doc.createElementNS(NAMESPACE_URI, "customerId");
        customerIdElem.setTextContent(payment.getUser() != null ? payment.getUser().getId().toString() : "");
        pElem.appendChild(customerIdElem);

        Element amountElem = doc.createElementNS(NAMESPACE_URI, "amount");
        amountElem.setTextContent(payment.getAmount().toString());
        pElem.appendChild(amountElem);

        Element statusElem = doc.createElementNS(NAMESPACE_URI, "status");
        statusElem.setTextContent(payment.getStatus());
        pElem.appendChild(statusElem);

        Element createdAtElem = doc.createElementNS(NAMESPACE_URI, "createdAt");
        createdAtElem.setTextContent(payment.getCreatedAt().toString());
        pElem.appendChild(createdAtElem);
    }
}
