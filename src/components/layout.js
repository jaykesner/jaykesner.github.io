import * as React from "react";
import { Link, useStaticQuery, graphql } from "gatsby";
import {
  container,
  content,
  heading,
  navLinks,
  navLinkItem,
  navLinkText,
  siteTitle,
} from "./Layout.module.css";
import "normalize.css";

const Layout = ({ pageTitle, children }) => {
  const data = useStaticQuery(graphql`
    {
      site {
        siteMetadata {
          title
        }
      }
    }
  `);
  return (
    <main className={container}>
      <section className={content}>
        <title>{data.site.siteMetadata.title}</title>
        <h1 className={siteTitle}>{data.site.siteMetadata.title}</h1>
        <nav>
          <ul className={navLinks}>
            <li className={navLinkItem}>
              <Link to="/" className={navLinkText}>
                Home
              </Link>
            </li>
            <li classname={navLinkItem}>
              <a href="https://github.com/jaykesner">Github</a>
            </li>
          </ul>
        </nav>
        <h1 className={heading}>{pageTitle}</h1>
        {children}
      </section>
    </main>
  );
};
export default Layout;
