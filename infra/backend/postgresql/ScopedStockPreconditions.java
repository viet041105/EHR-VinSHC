package org.vinshc.build;

import java.io.File;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/** Build-time PostgreSQL optimization; migration operations remain unchanged. */
public final class ScopedStockPreconditions {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("Expected the Stock Management liquibase.xml path");
        }
        File resource = new File(args[0]);
        DocumentBuilderFactory parser = DocumentBuilderFactory.newInstance();
        parser.setNamespaceAware(true);
        parser.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        parser.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        parser.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        parser.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        Document document = parser.newDocumentBuilder().parse(resource);
        String namespace = document.getDocumentElement().getNamespaceURI();
        // NodeList is live: repeatedly replace its first element.
        NodeList checks = document.getElementsByTagNameNS(namespace, "foreignKeyConstraintExists");
        if (checks.getLength() != 113) {
            throw new IllegalStateException("Unexpected Stock Management foreign-key precondition count");
        }
        int changed = 0;
        while (checks.getLength() > 0) {
            Element check = (Element) checks.item(0);
            String name = identifier(check.getAttribute("foreignKeyName"));
            Node parent = check;
            while (parent != null && !"changeSet".equals(parent.getLocalName())) {
                parent = parent.getParentNode();
            }
            if (parent == null) {
                throw new IllegalStateException("Foreign-key check has no changeset");
            }
            NodeList additions = ((Element) parent).getElementsByTagNameNS(namespace, "addForeignKeyConstraint");
            String table = null;
            for (int i = 0; i < additions.getLength(); i++) {
                Element addition = (Element) additions.item(i);
                if (name.equals(addition.getAttribute("constraintName"))) {
                    if (table != null) {
                        throw new IllegalStateException("Ambiguous foreign-key operation");
                    }
                    table = identifier(addition.getAttribute("baseTableName"));
                }
            }
            if (table == null || table.length() > 63) {
                throw new IllegalStateException("Foreign-key check has no supported target table");
            }
            // PostgreSQL's default identifier limit is 63 bytes; names here are ASCII.
            String storedName = name.substring(0, Math.min(name.length(), 63));
            Element sql = document.createElementNS(namespace, "sqlCheck");
            sql.setAttribute("expectedResult", "1");
            sql.setTextContent("SELECT count(*) FROM pg_catalog.pg_constraint "
                + "WHERE contype = 'f' AND conname = '" + storedName + "' "
                + "AND conrelid = to_regclass(format('%I.%I', current_schema(), '" + table + "'))");
            check.getParentNode().replaceChild(sql, check);
            changed++;
        }
        TransformerFactory factory = TransformerFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
        Transformer writer = factory.newTransformer();
        writer.transform(new DOMSource(document), new StreamResult(resource));
        System.out.println("Scoped " + changed + " Stock Management PostgreSQL foreign-key preconditions");
    }

    private static String identifier(String value) {
        if (!value.matches("[a-z][a-z0-9_]*")) {
            throw new IllegalArgumentException("Unexpected PostgreSQL migration identifier");
        }
        return value;
    }
}
